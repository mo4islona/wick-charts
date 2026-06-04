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
import { resolveAxisFontSize, resolveAxisTextColor } from '../theme/resolve';
import type { ChartTheme } from '../theme/types';
import { formatTime } from '../utils/time';

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
}

/** Below this opacity the span is removed from the DOM (matches React's prior `opacity <= 0.01` cutoff). */
const VISIBLE_OPACITY_EPS = 0.01;

/**
 * Append axis-label `<span>` children to `container`, keep them positioned
 * and faded in step with the chart's animation. Returns a cleanup function
 * that unsubscribes and removes all created spans.
 */
export function mountAxisLabels(opts: MountAxisLabelsOptions): () => void {
  const { chart, container, axis } = opts;
  const spans = new Map<number, HTMLSpanElement>();
  // Last theme whose colors/fonts were written to the spans' inline styles.
  // A reference change in `sync` triggers a one-shot restyle of reused spans.
  let appliedTheme: ChartTheme | null = null;
  const tracker = axis === 'x' ? chart.timeScale.tickTracker : chart.yScale.tickTracker;

  function currentTicks(): { ticks: readonly number[]; tickInterval: number } {
    if (axis === 'x') {
      return chart.timeScale.niceTickValues(chart.getDataInterval());
    }

    return { ticks: chart.yScale.niceTickValues(), tickInterval: 0 };
  }

  function formatLabel(value: number, tickInterval: number): string {
    if (axis === 'x') return formatTime(value, tickInterval);

    return chart.yScale.formatY(value);
  }

  function positionSpan(el: HTMLSpanElement, value: number): void {
    if (axis === 'x') {
      el.style.left = `${chart.timeScale.timeToX(value)}px`;

      return;
    }

    el.style.top = `${chart.yScale.valueToY(value)}px`;
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

  function createSpan(value: number, tickInterval: number, theme: ChartTheme): HTMLSpanElement {
    const el = document.createElement('span');
    el.textContent = formatLabel(value, tickInterval);
    el.style.position = 'absolute';
    el.style.userSelect = 'none';
    applyThemeStyles(el, theme);
    el.style.willChange = 'opacity';

    if (axis === 'x') {
      el.style.transform = 'translateX(-50%)';
      el.style.whiteSpace = 'nowrap';
    } else {
      el.style.right = '8px';
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

    const { ticks, tickInterval } = currentTicks();
    tracker.setCurrentTicks(ticks);
    const { entries } = tracker.snapshot();

    const seen = new Set<number>();
    for (const { value, opacity } of entries) {
      if (opacity <= VISIBLE_OPACITY_EPS) continue;

      seen.add(value);
      let el = spans.get(value);
      if (el === undefined) {
        el = createSpan(value, tickInterval, theme);
        spans.set(value, el);
      } else {
        const next = formatLabel(value, tickInterval);
        if (el.textContent !== next) el.textContent = next;
        if (themeChanged) applyThemeStyles(el, theme);
      }

      positionSpan(el, value);
      el.style.opacity = String(opacity);
    }

    for (const [value, el] of spans) {
      if (seen.has(value)) continue;
      el.remove();
      spans.delete(value);
    }
  }

  // Avoid syncing the labels twice per animating frame. `renderMain` emits both
  // `viewportChange` (the eased Y moved) and `tickFrame` (any animating frame)
  // in the same frame. While the viewport is animating, `tickFrame` already
  // drives the per-frame sync, so the redundant per-frame `viewportChange` is
  // skipped; when the viewport is idle (a discrete / snapped commit or a data
  // re-fit, where `tickFrame` doesn't fire) it syncs. `overlayChange` (theme /
  // data swaps) always syncs.
  function onViewportChange(): void {
    if (chart.getAnimationState().animating) return;

    sync();
  }

  sync();

  chart.on('tickFrame', sync);
  chart.on('viewportChange', onViewportChange);
  chart.on('overlayChange', sync);

  return () => {
    chart.off('tickFrame', sync);
    chart.off('viewportChange', onViewportChange);
    chart.off('overlayChange', sync);
    for (const el of spans.values()) el.remove();
    spans.clear();
  };
}
