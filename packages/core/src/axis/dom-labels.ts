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
import { isNewYearsDay } from '../utils/time';

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

/** How far past the chart edge (CSS px) a tick's label takes to fade out, held at the edge. */
const EDGE_FADE_PX = 8;

/** CSS px kept clear between two category names. */
const CATEGORY_GAP_PX = 8;

/** CSS px a tick label keeps from a cover, so it does not peek out at the cover's edge. */
const COVER_GAP_PX = 4;

const DAY = 86_400_000;
const YEAR = 365 * DAY;

function sameNames(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  return a.every((name, i) => name === b[i]);
}

/**
 * Append axis-label `<span>` children to `container`, keep them positioned
 * and faded in step with the chart's animation. Returns a cleanup function
 * that unsubscribes and removes all created spans.
 */
export function mountAxisLabels(opts: MountAxisLabelsOptions): () => void {
  const { chart, container, axis, scale } = opts;
  const spans = new Map<number, HTMLSpanElement>();
  let sizes = new WeakMap<HTMLSpanElement, { key: string; width: number; height: number }>();
  // The formatted label per span: `textContent` loses the subscript glyphs once they render as spans.
  const texts = new WeakMap<HTMLSpanElement, string>();
  // Last theme whose colors/fonts were written to the spans' inline styles.
  // A reference change in `sync` triggers a one-shot restyle of reused spans.
  let appliedTheme: ChartTheme | null = null;
  // Y-axis side the spans are anchored for; a flip re-anchors reused spans.
  let appliedSide: YAxisPosition | null = null;
  // A category axis names every n-th band when the names outgrow their bands.
  let categoryStride = 1;
  let widestName: { names: readonly string[]; format: unknown; font: string; width: number } | null = null;

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
    if (axis === 'y') return yScale().formatTick(value);

    const scale = chart.timeScale;
    const builtInDates = scale.getType() === 'time' && scale.getFormat() === null && tickInterval >= DAY;
    // Date labels carry no year, so the tick on January 1 names it instead.
    const yearStart = builtInDates && tickInterval < YEAR && isNewYearsDay(value, scale.getTimeZone());

    return scale.formatX(value, yearStart ? YEAR : tickInterval);
  }

  // Snapped, not raw: the canvas strokes on a whole device pixel, so an
  // unrounded label sits up to half a CSS pixel off its line.
  // Returns the label's opacity factor for the chart edge.
  function positionSpan(el: HTMLSpanElement, value: number): number {
    if (axis === 'x') {
      const x = chart.timeScale.timeToSnappedX(value);
      // A category name longer than its slot ends in an ellipsis instead of running into the next one.
      // Capped before `justifiedX` measures it, or the edge clamp uses the uncapped width.
      if (chart.timeScale.getType() === 'category') el.style.maxWidth = `${categoryNameRoom(x)}px`;

      const placement = justifiedX(el, x);
      el.style.left = `${placement.left}px`;

      return placement.opacity;
    }

    const placement = justifiedY(el, yScale().valueToSnappedY(value));
    el.style.top = `${placement.top}px`;

    return placement.opacity;
  }

  // A name's slot, cut where the chart ends: `justifiedX` would push a wider edge name into its neighbour.
  function categoryNameRoom(x: number): number {
    const half = (categoryStride * chart.timeScale.barWidthMedia(1) - CATEGORY_GAP_PX) / 2;
    const mediaWidth = chart.timeScale.getMediaWidth();
    // A name fading out past the edge is held there, so it keeps the room it had at the edge.
    const anchor = clamp(x, 0, mediaWidth);
    const cutLeft = Math.max(0, -chart.getAxisColumnWidth('left') - (anchor - half));
    const cutRight = Math.max(0, anchor + half - (mediaWidth + chart.getAxisColumnWidth('right')));

    return Math.max(0, 2 * half - cutLeft - cutRight);
  }

  // A label on a tick near the chart's edge shifts inward just enough to fit; the
  // gridline still marks the spot, and the label may run under a Y-axis column.
  // Once the tick leaves the view the label stays at the edge and fades out within
  // EDGE_FADE_PX, so it is never cut. Ticks further out keep their own spot, hidden,
  // or labels leaving after a pan would pile onto the edge.
  function justifiedX(el: HTMLSpanElement, x: number): { left: number; opacity: number } {
    const mediaWidth = chart.timeScale.getMediaWidth();
    const overshoot = Math.max(-x, x - mediaWidth, 0);
    if (overshoot >= EDGE_FADE_PX) return { left: x, opacity: 0 };

    const half = labelSize(el).width / 2;
    const min = half - chart.getAxisColumnWidth('left');
    const max = mediaWidth + chart.getAxisColumnWidth('right') - half;
    if (min > max) return { left: x, opacity: 1 };

    return { left: clamp(x, min, max), opacity: 1 - overshoot / EDGE_FADE_PX };
  }

  // The Y twin of `justifiedX`: a tick at the top edge would cut its label in half. The
  // bottom bound is the chart's, so a label on the plot floor still runs into the X axis row.
  function justifiedY(el: HTMLSpanElement, y: number): { top: number; opacity: number } {
    const plotHeight = yScale().getMediaHeight();
    const overshoot = Math.max(-y, y - plotHeight, 0);
    if (overshoot >= EDGE_FADE_PX) return { top: y, opacity: 0 };

    const half = labelSize(el).height / 2;
    const max = plotHeight + chart.xAxisHeight - half;
    if (half > max) return { top: y, opacity: 1 };

    return { top: clamp(y, half, max), opacity: 1 - overshoot / EDGE_FADE_PX };
  }

  // Measured once per text, font and width cap: reading layout on every animation frame would force a reflow each time.
  function labelSize(el: HTMLSpanElement): { width: number; height: number } {
    const { fontSize, fontFamily, maxWidth } = el.style;
    const key = `${texts.get(el) ?? ''}|${fontSize}|${fontFamily}|${maxWidth}`;
    const cached = sizes.get(el);
    if (cached !== undefined && cached.key === key) return cached;

    const size = { key, width: el.offsetWidth, height: el.offsetHeight };
    sizes.set(el, size);

    return size;
  }

  // Theme-derived styles are written to inline `style`, so they're effectively
  // cached on the element. `sync` re-applies them whenever the theme changes —
  // without that, a reused span keeps the previous palette's color/font after
  // `setTheme` (the "axis text doesn't follow the theme" regression).
  function applyThemeStyles(el: HTMLElement, theme: ChartTheme): void {
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

  // Room for the widest name, capped at `minLabelSpacing` so one long name cannot thin out the axis.
  function resolveCategoryStride(theme: ChartTheme): number {
    const step = chart.timeScale.barWidthMedia(1);
    if (!(step > 0)) return 1;

    const room = Math.min(widestCategoryName(theme), chart.timeScale.getMinLabelSpacing()) + CATEGORY_GAP_PX;

    return Math.max(1, Math.ceil(room / step));
  }

  // Measured once per name list, formatter and font, all names in one layout.
  function widestCategoryName(theme: ChartTheme): number {
    const names = chart.timeScale.getCategories();
    const format = chart.timeScale.getFormat();
    const font = `${resolveAxisFontSize(theme, axis)}px ${theme.typography.fontFamily}`;
    const cached = widestName;
    // Each data update re-derives the list into a new array, mostly with the same names.
    const hit = cached !== null && cached.format === format && cached.font === font && sameNames(cached.names, names);
    if (hit) return cached.width;

    const probe = document.createElement('div');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    applyThemeStyles(probe, theme);
    const spans = names.map((_, i) => {
      const el = document.createElement('span');
      el.style.position = 'absolute';
      el.style.whiteSpace = 'nowrap';
      el.textContent = formatLabel(i, 1);
      probe.appendChild(el);

      return el;
    });
    container.appendChild(probe);

    let width = 0;
    for (const el of spans) {
      width = Math.max(width, el.offsetWidth);
    }
    probe.remove();
    widestName = { names, format, font, width };

    return width;
  }

  // Read in one pass before the opacity writes, so one layout serves every span.
  function coverRects(): DOMRect[] {
    const rects: DOMRect[] = [];
    for (const el of chart.getAxisLabelCovers()) {
      // Each property is opt-in: without `visibilityProperty`, a `visibility: hidden` cover still reads visible.
      const visible = el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) ?? true;
      if (!el.isConnected || !visible) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) rects.push(rect);
    }

    return rects;
  }

  function isCovered(el: HTMLSpanElement, covers: readonly DOMRect[]): boolean {
    const box = el.getBoundingClientRect();

    return covers.some((cover) => {
      const apartX = box.right + COVER_GAP_PX <= cover.left || cover.right + COVER_GAP_PX <= box.left;
      const apartY = box.bottom + COVER_GAP_PX <= cover.top || cover.bottom + COVER_GAP_PX <= box.top;

      return !apartX && !apartY;
    });
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
    categoryStride = isCategory ? resolveCategoryStride(theme) : 1;

    const seen = new Set<number>();
    const placed: { el: HTMLSpanElement; opacity: number }[] = [];
    for (const { value, opacity } of entries) {
      const orphan = isCategory && value >= bandCount;
      const skipped = isCategory && value % categoryStride !== 0;
      if (opacity <= VISIBLE_OPACITY_EPS || orphan || skipped) continue;

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

      const edgeOpacity = positionSpan(el, value);
      // A category that just entered fades its name in while the others slide aside.
      const entering = isCategory ? chart.timeScale.bandEnterProgress(value) : 1;
      placed.push({ el, opacity: opacity * entering * edgeOpacity * headerClearance(value, theme) });
    }

    const covers = coverRects();
    for (const { el, opacity } of placed) {
      const covered = covers.length > 0 && opacity > VISIBLE_OPACITY_EPS && isCovered(el, covers);
      el.style.opacity = String(covered ? 0 : opacity);
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

  // A web font that lands after the first measure widens every label: the cached
  // widths would let an edge label overrun the chart by the difference.
  function remeasure(): void {
    sizes = new WeakMap();
    widestName = null;
    sync();
  }

  sync();

  const fonts = typeof document === 'undefined' ? undefined : document.fonts;
  fonts?.addEventListener('loadingdone', remeasure);
  chart.on('tickFrame', sync);
  chart.on('viewportChange', syncWhenIdle);
  chart.on('overlayChange', syncWhenIdle);
  chart.on('axisLabelCoverChange', sync);

  return () => {
    fonts?.removeEventListener('loadingdone', remeasure);
    chart.off('tickFrame', sync);
    chart.off('viewportChange', syncWhenIdle);
    chart.off('overlayChange', syncWhenIdle);
    chart.off('axisLabelCoverChange', sync);
    for (const el of spans.values()) el.remove();
    spans.clear();
  };
}
