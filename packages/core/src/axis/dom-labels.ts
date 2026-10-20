/**
 * Framework-agnostic DOM axis-label manager.
 *
 * Owns the `<span>` elements rendered inside a framework-provided container
 * and updates their position / opacity imperatively on every chart event
 * that can affect layout — bypassing the framework's render loop so the
 * labels stay in lockstep with the canvas paint instead of lagging behind
 * an async commit.
 *
 * The helper plugs into the chart's existing `AxisTickTracker` so DOM-label
 * fade-in / fade-out advances frame-for-frame with the canvas grid lines.
 * Container layout (size, anchoring) stays with the caller — the helper
 * only mutates child `<span>`s.
 */

import type { ChartInstance } from '../chart';
import type { YScale } from '../scales/y-scale';
import { resolveAxisFontSize, resolveAxisTextColor } from '../theme/resolve';
import type { ChartTheme } from '../theme/types';
import type { YAxisPosition } from '../types';
import { clamp } from '../utils/math';
import { renderNumberText } from '../utils/number-text';

export interface MountAxisLabelsOptions {
  readonly chart: ChartInstance;
  /**
   * Caller-owned container. The helper appends `<span>`s as direct children
   * and removes them on cleanup. The container's own layout (positioning,
   * dimensions) is the framework component's responsibility — typically a
   * `position: absolute` rectangle covering one axis strip.
   */
  readonly container: HTMLElement;
  readonly axis: 'x' | 'y';
  /** Named Y scale (`ChartOptions.scales`) whose labels to render. Default: the default scale. */
  readonly scale?: string;
}

/** Below this opacity the span is removed from the DOM (matches React's prior `opacity <= 0.01` cutoff). */
const VISIBLE_OPACITY_EPS = 0.01;

/**
 * Append axis-label `<span>` children to `container`, keep them positioned
 * and faded in step with the chart's animation. Returns a cleanup function
 * that unsubscribes and removes all created spans.
 */
export function mountAxisLabels(opts: MountAxisLabelsOptions): () => void {
  const { chart, container, axis, scale } = opts;
  const spans = new Map<number, HTMLSpanElement>();
  const widths = new WeakMap<HTMLSpanElement, { key: string; width: number }>();
  // The formatted label per span: `textContent` loses the subscript glyphs once they render as spans.
  const texts = new WeakMap<HTMLSpanElement, string>();
  // Last theme whose colors/fonts were written to the spans' inline styles.
  // A reference change in `sync` triggers a one-shot restyle of reused spans.
  let appliedTheme: ChartTheme | null = null;
  // Y-axis side the spans are anchored for; a flip re-anchors reused spans.
  let appliedSide: YAxisPosition | null = null;

  // Resolved on every read: `setScales` can drop and re-add a named scale.
  function yScale(): YScale {
    return chart.getYScale(scale);
  }

  function ySide(): YAxisPosition {
    return chart.getYScaleColumn(scale)?.position ?? chart.yAxisPosition;
  }

  function currentTicks(): { ticks: readonly number[]; tickInterval: number } {
    if (axis === 'x') {
      return chart.timeScale.niceTickValues(chart.getDataInterval());
    }

    return { ticks: yScale().niceTickValues(), tickInterval: 0 };
  }

  function formatLabel(value: number, tickInterval: number): string {
    if (axis === 'x') return chart.timeScale.formatX(value, tickInterval);

    return yScale().formatY(value);
  }

  // Snapped, not raw: the canvas strokes on a whole device pixel, so an
  // unrounded label sits up to half a CSS pixel off its line.
  function positionSpan(el: HTMLSpanElement, value: number): void {
    if (axis === 'x') {
      // A category name longer than its step ends in an ellipsis instead of running into the next one.
      // Capped before `justifiedX` measures it, or the edge clamp uses the uncapped width.
      if (chart.timeScale.getType() === 'category') el.style.maxWidth = `${chart.timeScale.barWidthMedia(1)}px`;
      el.style.left = `${justifiedX(el, chart.timeScale.timeToSnappedX(value))}px`;

      return;
    }

    el.style.top = `${yScale().valueToSnappedY(value)}px`;
  }

  // A label on a tick near the chart's edge shifts inward just enough to fit; the
  // gridline still marks the spot, and the label may run under a Y-axis column.
  // A tick already out of view keeps its spot, or labels leaving after a pan pile onto the edge.
  function justifiedX(el: HTMLSpanElement, x: number): number {
    const inView = x >= 0 && x <= chart.timeScale.getMediaWidth();
    if (!inView) return x;

    const half = labelWidth(el) / 2;
    const min = half - chart.getAxisColumnWidth('left');
    const max = chart.timeScale.getMediaWidth() + chart.getAxisColumnWidth('right') - half;
    if (min > max) return x;

    return clamp(x, min, max);
  }

  // Measured once per text, font and width cap: reading layout on every animation frame would force a reflow each time.
  function labelWidth(el: HTMLSpanElement): number {
    const { fontSize, fontFamily, maxWidth } = el.style;
    const key = `${texts.get(el) ?? ''}|${fontSize}|${fontFamily}|${maxWidth}`;
    const cached = widths.get(el);
    if (cached !== undefined && cached.key === key) return cached.width;

    const width = el.offsetWidth;
    widths.set(el, { key, width });

    return width;
  }

  // Theme-derived styles are written to inline `style`, so they're effectively
  // cached on the element. `sync` re-applies them whenever the theme changes —
  // without that, a reused span keeps the previous palette's color/font after
  // `setTheme` (the "axis text doesn't follow the theme" regression).
  function applyThemeStyles(el: HTMLSpanElement, theme: ChartTheme): void {
    el.style.color = resolveAxisTextColor(theme, axis);
    el.style.fontSize = `${resolveAxisFontSize(theme, axis)}px`;
    el.style.fontFamily = theme.typography.fontFamily;
  }

  // Y labels hug the outer edge of the column on either side — the mirror of
  // each other, and a label wider than the column spills into the plot
  // rather than off the chart.
  function applyYAnchor(el: HTMLSpanElement, side: YAxisPosition): void {
    const outer = side === 'left' ? 'left' : 'right';
    const inner = side === 'left' ? 'right' : 'left';
    el.style[outer] = '8px';
    el.style[inner] = '';
  }

  // A left axis shares its column with the header: a label fades out across
  // its own height as it rises underneath.
  function headerClearance(value: number, theme: ChartTheme): number {
    const header = chart.headerHeight;
    if (axis !== 'y' || header <= 0 || ySide() !== 'left') return 1;

    const labelHeight = resolveAxisFontSize(theme, axis);
    const labelTop = yScale().valueToSnappedY(value) - labelHeight / 2;

    return clamp((labelTop - header + labelHeight) / labelHeight, 0, 1);
  }

  function setText(el: HTMLSpanElement, text: string): void {
    if (texts.get(el) === text) return;

    texts.set(el, text);
    renderNumberText(el, text, { mute: false });
  }

  function createSpan(value: number, tickInterval: number, theme: ChartTheme): HTMLSpanElement {
    const el = document.createElement('span');
    setText(el, formatLabel(value, tickInterval));
    el.style.position = 'absolute';
    el.style.userSelect = 'none';
    applyThemeStyles(el, theme);
    el.style.willChange = 'opacity';

    if (axis === 'x') {
      el.style.transform = 'translateX(-50%)';
      el.style.whiteSpace = 'nowrap';
      if (chart.timeScale.getType() === 'category') {
        el.style.overflow = 'hidden';
        el.style.textOverflow = 'ellipsis';
      }
    } else {
      applyYAnchor(el, ySide());
      el.style.transform = 'translateY(-50%)';
      el.style.fontVariantNumeric = 'tabular-nums';
    }

    container.appendChild(el);

    return el;
  }

  function sync(): void {
    const theme = chart.getTheme();
    // `setTheme` swaps in a fresh theme object, so a reference change means the
    // palette/typography moved and every reused span's inline styles are stale.
    // Refresh them once per change rather than every frame — `sync` also fires
    // on tickFrame / viewportChange, where the theme is unchanged.
    const themeChanged = theme !== appliedTheme;
    appliedTheme = theme;

    const side = ySide();
    const sideChanged = axis === 'y' && side !== appliedSide;
    appliedSide = side;

    const tracker = axis === 'x' ? chart.timeScale.tickTracker : yScale().tickTracker;
    const { ticks, tickInterval } = currentTicks();
    tracker.setCurrentTicks(ticks);
    const { entries } = tracker.snapshot();

    // A tick still fading out past the last band has no category left to name.
    const isCategory = axis === 'x' && chart.timeScale.getType() === 'category';
    const bandCount = chart.timeScale.getCategories().length;

    const seen = new Set<number>();
    for (const { value, opacity } of entries) {
      const orphan = isCategory && value >= bandCount;
      if (opacity <= VISIBLE_OPACITY_EPS || orphan) continue;

      seen.add(value);
      let el = spans.get(value);
      if (el === undefined) {
        el = createSpan(value, tickInterval, theme);
        spans.set(value, el);
      } else {
        setText(el, formatLabel(value, tickInterval));
        if (themeChanged) applyThemeStyles(el, theme);
        if (sideChanged) applyYAnchor(el, side);
      }

      positionSpan(el, value);
      // A category that just entered fades its name in while the others slide aside.
      const entering = isCategory ? chart.timeScale.bandEnterProgress(value) : 1;
      el.style.opacity = String(opacity * entering * headerClearance(value, theme));
    }

    for (const [value, el] of spans) {
      if (seen.has(value)) continue;
      el.remove();
      spans.delete(value);
    }
  }

  // Avoid syncing the labels twice per animating frame. `renderMain` emits both
  // `viewportChange` (the eased Y moved) and `tickFrame` (any animating frame)
  // in the same frame, and streaming emits `overlayChange` on every data tick.
  // While the viewport is animating, `tickFrame` already drives the per-frame
  // sync (re-reading theme + ticks), so both discrete signals are skipped;
  // when the viewport is idle (a discrete / snapped commit, a data re-fit, or
  // a theme swap at rest — where `tickFrame` doesn't fire) they sync.
  function syncWhenIdle(): void {
    if (chart.getAnimationState().animating) return;

    sync();
  }

  sync();

  chart.on('tickFrame', sync);
  chart.on('viewportChange', syncWhenIdle);
  chart.on('overlayChange', syncWhenIdle);

  return () => {
    chart.off('tickFrame', sync);
    chart.off('viewportChange', syncWhenIdle);
    chart.off('overlayChange', syncWhenIdle);
    for (const el of spans.values()) el.remove();
    spans.clear();
  };
}
