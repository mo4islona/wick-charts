<script lang="ts">
import {
  type AnimationsConfig,
  type AxisConfig,
  ChartInstance,
  type ChartOptions,
  type ChartTheme,
  type CrosshairPosition,
  type EdgeReachedInfo,
  type FadeConfig,
  type PointClickInfo,
  type SeriesHoverInfo,
  type VisibleRange,
  type VisibleRangeSpec,
  catppuccin,
  deepEqual,
} from '@wick-charts/core';
import { onDestroy, onMount, tick } from 'svelte';

import {
  initChartContext,
  initInfoBarAnchor,
  initLegendAnchor,
  initLegendRightAnchor,
  initNavigatorAnchor,
  initThemeContext,
  initTitleAnchor,
} from './context';

type PerfOption = NonNullable<ChartOptions['perf']>;

/** Visual theme. Live — changing this at runtime updates all themed elements. */
export let theme: ChartTheme = catppuccin.theme;
/** Grouped axis configuration (Y/X visibility, bounds, sizing). Live. */
export let axis: AxisConfig | undefined = undefined;
/**
 * Viewport padding. `top`/`bottom` are in pixels. `left`/`right` accept either pixels (`50`)
 * or data intervals (`{ intervals: 3 }`). Set to 0 for edge-to-edge sparklines. Updates are
 * applied reactively when this prop or the measured header height changes.
 * Defaults: `{ top: 20, bottom: 20, right: { intervals: 3 }, left: { intervals: 0 } }`.
 */
// biome-ignore format: keep the inline shape so the parity checker matches React's type string verbatim
export let padding: { top?: number; bottom?: number; right?: number | { intervals: number }; left?: number | { intervals: number }; } | undefined = undefined;
/**
 * Viewport-level streaming behavior. Captured at mount only — changing
 * this prop after the chart is created is ignored.
 */
export let viewport: { maxVisibleBars?: number; initialRange?: VisibleRangeSpec } | undefined = undefined;
/**
 * Controlled visible range. Same shape as the imperative
 * `chart.setVisibleRange` — a bar count, an explicit `{from, to}` window, or
 * `{from, bars}`. Every reference/value change applies via
 * `chart.setVisibleRange`, so pair it with `onVisibleRangeChange` for a
 * two-way binding; a same-value literal (compared structurally) is a no-op,
 * so an inline object doesn't re-apply on every render.
 *
 * For a one-shot initial window that isn't re-applied on every prop change,
 * use `viewport.initialRange` instead.
 */
export let visibleRange: VisibleRangeSpec | undefined = undefined;
/** Show the chart background gradient. Live. Defaults to true. */
export let gradient: boolean = true;
/**
 * Enable zoom, pan, and crosshair interactions. Defaults to true.
 *
 * Mount-only — core has no `setInteractive`, so changing this prop after
 * mount is ignored.
 */
export let interactive: boolean | undefined = undefined;
/** Background grid configuration. Live. Default: `{ visible: true }`. */
export let grid: { visible: boolean } | undefined = undefined;
/**
 * Soft fade-out at the top of the plot area, so series content dissolves
 * under a floating `<Title>` / `<InfoBar>` instead of colliding with it.
 * The mask erases canvas alpha rather than painting a cover color, so it
 * stays correct over the default background gradient. Live.
 *
 * Two directions, independently controlled:
 *
 * **X (under the axis)** — panning content slides under the Y-axis column
 * and dissolves instead of hard-clipping at the pane edge. **On by
 * default** as a 60px ramp that finishes just inside the axis column,
 * before the label glyphs; `{ right }` overrides the total ramp width in
 * CSS px (`0` disables). `{ left }` adds the mirror zone at the left pane
 * edge (default off).
 *
 * **Top (under the header)** — opt-in. `true` enables the auto zone
 * (measured header + 24px run-out, half the header fold-in released so
 * data rides up into the zone at rest), `{ top }` sets the zone height
 * explicitly, and `{ overlap }` tunes how many px of the fold-in to
 * release (0 keeps the strict fold-in). Off unless one of those is set.
 *
 * `false` — every mask off, strict edges everywhere.
 */
// biome-ignore format: keep the inline shape so the parity checker matches React's type string verbatim
export let fade: boolean | { top?: number; overlap?: number; right?: number; left?: number } | undefined = undefined;
/**
 * How `<Title>` and `<InfoBar>` are positioned relative to the canvas. Live.
 * - `'overlay'` (default): absolute overlays on top of the canvas.
 * - `'inline'`: flex siblings above the canvas — the canvas (and grid) shift down.
 */
export let headerLayout: 'overlay' | 'inline' = 'overlay';
/**
 * Animation control. `true` / omitted uses built-in defaults; `false`
 * disables every category. Per-series options on `<LineSeries>` /
 * `<CandlestickSeries>` / `<BarSeries>` override these chart-level
 * defaults unless the category here is explicitly `false`.
 *
 * **Init-only, but diffed by value, not reference.** A same-value inline
 * object literal is a no-op — only a genuine change to the resolved config
 * recreates the underlying `ChartInstance`, since the animation engine
 * doesn't support live reconfiguration yet.
 */
export let animations: boolean | AnimationsConfig | undefined = undefined;
/**
 * Enable runtime performance instrumentation. Off by default. Read at mount only;
 * later changes are ignored.
 */
export let perf: PerfOption | undefined = undefined;
/**
 * Fired after the user releases a pan/zoom gesture that pulled the viewport
 * past a data edge by more than ~10% of the visible range. Hosts typically
 * respond by prefetching more history. Captured at mount only; changing
 * the prop identity later is ignored.
 */
export let onEdgeReached: ((info: EdgeReachedInfo) => void) | undefined = undefined;
/**
 * Fired on a click (or tap) on the chart canvas that isn't the tail end of a
 * pan drag. `info.spatialHit` resolves a pie/heatmap/custom-spatial series
 * directly under the pointer; for a time-series series, resolve the point
 * yourself from `info.time` (`chart.getDataAtTime` / `buildHoverSnapshots`).
 * Live — the latest callback is always used.
 */
export let onPointClick: ((info: PointClickInfo) => void) | undefined = undefined;
/**
 * Fired on a double-click on the chart canvas. The chart also responds by
 * calling `fitContent()`. Live — the latest callback is always used.
 */
export let onPointDoubleClick: ((info: PointClickInfo) => void) | undefined = undefined;
/**
 * Fired when the spatially-hovered series/index changes (pie, heatmap, or a
 * custom spatial kind) — `null` when the pointer leaves every hit area.
 * Live — the latest callback is always used.
 */
export let onSeriesHover: ((hit: SeriesHoverInfo | null) => void) | undefined = undefined;
/**
 * Fired once the underlying `ChartInstance` is constructed — on mount, and
 * again if the chart is ever rebuilt (a genuine `animations` value change).
 * Live — the latest callback is always used for the next rebuild.
 */
export let onReady: ((chart: ChartInstance) => void) | undefined = undefined;
/**
 * Fired whenever the committed visible range changes — pan, zoom,
 * `fitContent()`, a data update that shifts the tail-scroll window, or a
 * `visibleRange` prop change. Live — the latest callback is always used.
 */
export let onVisibleRangeChange: ((range: VisibleRange) => void) | undefined = undefined;
/**
 * Fired on every crosshair move, with `null` when the pointer leaves the
 * chart. Live — the latest callback is always used.
 */
export let onCrosshairMove: ((position: CrosshairPosition | null) => void) | undefined = undefined;
/** Inline style for the chart's outer wrapper element. Live. */
export let style: string = '';

let containerEl: HTMLDivElement;
let topOverlayEl: HTMLDivElement | null = null;
let titleAnchorEl: HTMLDivElement;
let infoBarAnchorEl: HTMLDivElement;
let legendAnchorEl: HTMLDivElement;
let legendRightAnchorEl: HTMLDivElement;
let navigatorAnchorEl: HTMLDivElement;

const chartStore = initChartContext();
const themeStore = initThemeContext(theme);
const titleAnchorStore = initTitleAnchor();
const infoBarAnchorStore = initInfoBarAnchor();
const legendAnchorStore = initLegendAnchor();
const legendRightAnchorStore = initLegendRightAnchor();
const navigatorAnchorStore = initNavigatorAnchor();

let instance: ChartInstance | null = null;
let resizeObserver: ResizeObserver | null = null;
let topOverlayHeight = 0;

/** Run-out below the measured header (CSS px) for the auto `fade` zone —
 *  content starts dissolving this far before it slides under the header. */
const FADE_AUTO_BAND = 24;

// Fade resolution — shared by the header fold-in below and `applyFade`.
// `overlap` deliberately applies only while the fade is on: without the
// mask, letting data ride under the header would just recreate the
// collision the strict fold-in exists to prevent.
// The top mask is opt-in: `true`, `{ top }`, or `{ overlap }` arms it (a
// pure X config like `{ right: 0 }` does not).
$: fadeTopRequested = typeof fade === 'object' ? fade.top !== undefined || fade.overlap !== undefined : fade === true;
$: fadeEnabled = fade !== false && fadeTopRequested;
// Auto overlap: half the measured header — with the full fold-in intact the
// zone would cover only padding and enabling the fade would change nothing
// visible at rest. Explicit `overlap` (including 0) wins.
$: fadeOverlap = (() => {
  if (!fadeEnabled) return 0;

  const explicit = typeof fade === 'object' ? fade.overlap : undefined;
  if (explicit !== undefined) return Math.max(0, explicit);

  return topOverlayHeight / 2;
})();
$: resolvedFadeTop = (() => {
  if (!fadeEnabled) return 0;
  if (typeof fade === 'object' && fade.top !== undefined) return fade.top;

  const measured = headerLayout === 'overlay' ? topOverlayHeight : 0;

  return measured > 0 ? measured + FADE_AUTO_BAND : FADE_AUTO_BAND;
})();

// Inline mode: browser flex already reserves header height, so folding it
// into padding.top would double-shift the data. Only overlay needs the fold.
$: headerExtra = headerLayout === 'overlay' ? Math.max(0, topOverlayHeight - fadeOverlap) : 0;

function applyPadding() {
  if (!instance) return;

  const userTop = padding?.top ?? 20;
  const merged: ChartOptions['padding'] = { top: userTop + headerExtra };
  if (padding?.bottom !== undefined) merged.bottom = padding.bottom;
  if (padding?.right !== undefined) merged.right = padding.right;
  if (padding?.left !== undefined) merged.left = padding.left;
  instance.setPadding(merged);
}

// Capture perf at mount only — mirror React's perfRef so a later change of
// object identity doesn't recreate the chart.
const perfAtMount = perf;
// Same mount-only capture for the edge callback — the chart binds it once.
const onEdgeReachedAtMount = onEdgeReached;

/** Seed the constructor's fade config so the very first frame is already
 *  correct — the reactive setFade block lands the header-measured top zone
 *  right after, but an opted-out chart must not flash the default X mask
 *  for one paint. */
function seedFadeOption(options: ChartOptions): void {
  if (fade === false) {
    options.fade = { top: 0, right: 0, left: 0 };

    return;
  }
  if (typeof fade !== 'object') return;

  const seed: FadeConfig = {};
  if (fade.top !== undefined) seed.top = fade.top;
  if (fade.right !== undefined) seed.right = fade.right;
  if (fade.left !== undefined) seed.left = fade.left;
  options.fade = seed;
}

// Wires up (or tears down) the header-height observer for the current
// `headerLayout`. Called on mount AND whenever `headerLayout` flips at
// runtime — overlay needs a live measurement; inline lets browser flex
// layout reserve the height directly.
function syncHeaderObserver() {
  resizeObserver?.disconnect();
  resizeObserver = null;

  const headerEl = headerLayout === 'overlay' ? topOverlayEl : null;
  if (!headerEl) {
    // Reset stale measurement so the next applyPadding call drops back to
    // the user's configured `padding.top` instead of carrying inline-mode
    // height.
    topOverlayHeight = 0;
    applyPadding();

    return;
  }

  const measure = () => {
    topOverlayHeight = headerEl.getBoundingClientRect().height;
    applyPadding();
  };
  measure();
  resizeObserver = new ResizeObserver(measure);
  resizeObserver.observe(headerEl);
}

// Read the exported `let` directly (not a frozen mount-time const) so each
// call sees the caller's latest callback, mirroring Vue's reactive-props
// read. Shared between the mount path and the animations-triggered rebuild
// below so the two don't drift.
function subscribeDeclarativeEvents(target: ChartInstance): void {
  target.on('pointClick', (info) => onPointClick?.(info));
  target.on('pointDoubleClick', (info) => onPointDoubleClick?.(info));
  target.on('seriesHover', (hit) => onSeriesHover?.(hit));
  target.on('crosshairMove', (position) => onCrosshairMove?.(position));
  const emitVisibleRangeChange = () => onVisibleRangeChange?.(target.getVisibleRange());
  target.on('viewportChange', emitVisibleRangeChange);
  target.on('dataUpdate', emitVisibleRangeChange);
  target.on('seriesChange', emitVisibleRangeChange);
}

onMount(() => {
  const options: ChartOptions = {};
  if (axis) options.axis = axis;
  if (theme) options.theme = theme;
  if (padding) options.padding = padding;
  if (viewport) options.viewport = viewport;
  if (interactive !== undefined) options.interactive = interactive;
  if (grid !== undefined) options.grid = grid;
  if (perfAtMount !== undefined) options.perf = perfAtMount;
  if (onEdgeReachedAtMount) options.onEdgeReached = onEdgeReachedAtMount;
  if (animations !== undefined) options.animations = animations;
  seedFadeOption(options);
  instance = new ChartInstance(containerEl, options);
  chartStore.set(instance);
  subscribeDeclarativeEvents(instance);
  onReady?.(instance);

  void tick().then(() => {
    titleAnchorStore.set(titleAnchorEl);
    infoBarAnchorStore.set(infoBarAnchorEl);
    legendAnchorStore.set(legendAnchorEl);
    legendRightAnchorStore.set(legendRightAnchorEl);
    navigatorAnchorStore.set(navigatorAnchorEl);
    syncHeaderObserver();
  });
});

// Re-attach the observer when `headerLayout` toggles after mount, so an
// overlay → inline → overlay round-trip keeps measuring the new header.
let lastHeaderLayout = headerLayout;
$: if (instance && headerLayout !== lastHeaderLayout) {
  lastHeaderLayout = headerLayout;
  void tick().then(syncHeaderObserver);
}

onDestroy(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  instance?.destroy();
  instance = null;
  chartStore.set(null);
  titleAnchorStore.set(null);
  infoBarAnchorStore.set(null);
  legendAnchorStore.set(null);
  legendRightAnchorStore.set(null);
  navigatorAnchorStore.set(null);
});

$: if (instance && theme) {
  instance.setTheme(theme);
  themeStore.set(theme);
}

$: if (instance && axis) {
  instance.setAxis(axis);
}

$: if (instance && grid !== undefined) {
  instance.setGrid(grid);
}

// Init-only: a post-mount `animations` VALUE change tears down the instance
// and rebuilds with the new config. `deepEqual` (not reference equality)
// gates the rebuild — a caller's brand-new inline literal with the same
// values is a no-op, since Svelte re-runs this reactive block on every
// reference change regardless of content.
//
// Children inside the `{#if $chartStore}` block grab the chart store
// snapshot in their own setup. To force them to re-mount against the
// new ChartInstance, push `null` through the store first — the
// `{#if}` guard tears down the slot — then `await tick()` so Svelte
// commits the unmount before the new instance is constructed. Setting
// the store to the new instance re-mounts children, who re-read the
// current chart in their fresh setup.
let lastAnimations = animations;
async function rebuildChartFromAnimations() {
  if (!instance || !containerEl) return;
  instance.destroy();
  instance = null;
  chartStore.set(null);
  await tick();
  const opts: ChartOptions = {};
  if (axis) opts.axis = axis;
  if (theme) opts.theme = theme;
  if (padding) opts.padding = padding;
  if (viewport) opts.viewport = viewport;
  if (interactive !== undefined) opts.interactive = interactive;
  if (grid !== undefined) opts.grid = grid;
  if (perfAtMount !== undefined) opts.perf = perfAtMount;
  if (onEdgeReachedAtMount) opts.onEdgeReached = onEdgeReachedAtMount;
  if (animations !== undefined) opts.animations = animations;
  seedFadeOption(opts);
  instance = new ChartInstance(containerEl, opts);
  subscribeDeclarativeEvents(instance);
  chartStore.set(instance);
  onReady?.(instance);
}
$: if (instance && !deepEqual(animations, lastAnimations)) {
  lastAnimations = animations;
  rebuildChartFromAnimations();
}

// Controlled visible range: only re-apply when the resolved value actually
// differs from what we last applied ourselves, so feeding the range from
// `onVisibleRangeChange` back into this prop (the standard two-way-binding
// shape) doesn't re-trigger `setVisibleRange` with an unchanged spec on
// every render. The latch remembers which instance it applied to — a chart
// rebuild (an `animations` change) must receive the range again even though
// the spec's value hasn't moved.
let lastAppliedVisibleRange: { instance: ChartInstance; spec: VisibleRangeSpec } | undefined;
async function applyControlledVisibleRange(target: ChartInstance, next: VisibleRangeSpec) {
  lastAppliedVisibleRange = { instance: target, spec: next };
  // On the chart's first tick, a series child (e.g. `<CandlestickSeries>`)
  // hasn't mounted and seeded its data yet, so the engine is still on the
  // placeholder `dataInterval` (60s) — a `{from, to}` spec sized for the
  // real interval would fail the 2-bar-minimum guard. Awaiting a tick lets
  // the child's data-seed (and its `detectInterval` call) land first.
  await tick();
  target.setVisibleRange(next);
}
$: if (
  instance &&
  visibleRange !== undefined &&
  !(
    lastAppliedVisibleRange !== undefined &&
    lastAppliedVisibleRange.instance === instance &&
    deepEqual(lastAppliedVisibleRange.spec, visibleRange)
  )
) {
  applyControlledVisibleRange(instance, visibleRange);
}

// Re-apply padding on any input that affects it — including `headerExtra`,
// so a runtime `headerLayout` toggle re-folds the measured header height
// even when the consumer never passes an explicit `padding` prop.
$: if (instance) {
  void padding;
  void headerExtra;
  applyPadding();
}

// Fade rides the instance identity too, so a rebuilt chart (an `animations`
// change) receives the current zones again; `setFade` no-ops on unchanged
// values, so the extra runs are free. Omitting `right` keeps the core's
// under-the-axis default armed; only `false` (every mask off) or an
// explicit `right` overrides it.
$: if (instance) {
  if (fade === false) {
    instance.setFade({ top: 0, right: 0, left: 0 });
  } else {
    const next: FadeConfig = { top: resolvedFadeTop };
    if (typeof fade === 'object' && fade.right !== undefined) next.right = fade.right;
    if (typeof fade === 'object' && fade.left !== undefined) next.left = fade.left;
    instance.setFade(next);
  }
}

$: gradientBg = (() => {
  const t = theme;
  const [gtop, gbot] = t?.chartGradient ?? ['transparent', 'transparent'];
  const bg = t?.background ?? 'transparent';

  return gradient ? `linear-gradient(to bottom, ${gtop} 0%, ${bg} 70%, ${gbot} 100%)` : bg;
})();
</script>

<div
  {style}
  style:position="relative"
  style:display="flex"
  style:flex-direction="column"
  style:width="100%"
  style:height="100%"
  style:min-height="240px"
  style:overflow="hidden"
  style:background={gradientBg}
>
  <div style="display:flex;flex-direction:row;flex:1;min-height:0">
    <div style="display:flex;flex-direction:column;flex:1;min-width:0;min-height:0">
      {#if headerLayout === 'inline'}
        <div
          data-chart-header=""
          style="flex-shrink:0;display:flex;flex-direction:column;pointer-events:none"
        >
          <div bind:this={titleAnchorEl} data-chart-title-anchor=""></div>
          <div bind:this={infoBarAnchorEl} data-tooltip-legend-anchor=""></div>
        </div>
      {/if}
      <div
        bind:this={containerEl}
        style="position:relative;flex:1;min-width:0;min-height:0;overflow:hidden"
      >
        {#if headerLayout === 'overlay'}
          <div
            bind:this={topOverlayEl}
            data-chart-top-overlay=""
            style="position:absolute;top:0;left:0;right:0;z-index:2;pointer-events:none;display:flex;flex-direction:column"
          >
            <div bind:this={titleAnchorEl} data-chart-title-anchor=""></div>
            <div bind:this={infoBarAnchorEl} data-tooltip-legend-anchor=""></div>
          </div>
        {/if}
        {#if $chartStore}
          <div
            data-chart-series-overlay=""
            style="position:absolute;inset:0;pointer-events:none;z-index:3"
          >
            <slot />
          </div>
        {/if}
      </div>
    </div>
    <div bind:this={legendRightAnchorEl} data-legend-right-anchor="" style="flex:0 0 auto"></div>
  </div>
  <div bind:this={legendAnchorEl} data-legend-anchor="" style="flex:0 0 auto"></div>
  <div bind:this={navigatorAnchorEl} data-navigator-anchor="" style="flex:0 0 auto"></div>
</div>
