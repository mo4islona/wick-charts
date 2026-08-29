/**
 * Chart constructor options — the public `ChartOptions` shape plus the
 * three resolver helpers (`resolvePadding`, `resolveMaxVisibleBars`,
 * `resolvePerfOptions`) chart construction runs at instantiation time.
 *
 * Lives in its own module so chart.ts stays focused on the runtime
 * controller; option types / defaults / merge logic doesn't need to be
 * read together with the render loop.
 */

import type { AnimationsConfig } from '../animation/config';
// Type-only on purpose: a value import of PerfMonitor would drag the perf
// module into every bundle. The chart receives perf code via the option.
import type { PerfConfig } from '../perf/perf-hud';
import type { PerfMonitor } from '../perf/perf-monitor';
import type { ChartTheme } from '../theme/types';
import type { AxisConfig, HorizontalPadding, VisibleRangeSpec } from '../types';
import { DEFAULT_MAX_VISIBLE_BARS, MIN_VISIBLE_BARS } from './pan-zoom-math';

/** Which data side the user pulled past during a gesture. */
export type EdgeSide = 'left' | 'right';

/**
 * Host-controlled visual state for a chart edge:
 * - `idle`: nothing rendered (default).
 * - `loading`: a subtle spinner appears in the overshoot area.
 * - `no-data`: a dashed boundary line + "No more data" label appears at the data edge.
 * - `has-more`: reserved — currently behaves like `idle`. Use when more data exists but is not being fetched.
 */
export type EdgeState = 'idle' | 'loading' | 'no-data' | 'has-more';

/** Payload for {@link ChartOptions.onEdgeReached}. */
export interface EdgeReachedInfo {
  side: EdgeSide;
  /** Time units the user pulled past the soft bound. */
  overshoot: number;
  /** Soft-bound timestamp that was crossed (dataStart - leftPad or dataEnd + rightPad). */
  boundaryTime: number;
}

/** Options passed when creating a new ChartInstance. */
export interface ChartOptions {
  theme?: ChartTheme;
  axis?: AxisConfig;
  /**
   * Viewport padding. `top`/`bottom` are in pixels. `left`/`right` accept either pixels (`50`)
   * or data intervals (`{ intervals: 3 }`). Defaults: `{ top: 20, bottom: 20, right: { intervals: 3 }, left: { intervals: 0 } }`.
   */
  padding?: {
    top?: number;
    bottom?: number;
    right?: HorizontalPadding;
    left?: HorizontalPadding;
  };
  /**
   * Viewport-level streaming behavior.
   */
  viewport?: {
    /**
     * Maximum number of data bars (candles/points) the viewport will fit
     * before it stops growing and switches to tail-scroll. While the data
     * span is below this threshold, streaming ticks expand the right edge
     * to absorb new points; once the span exceeds it, the visible window
     * holds at this width and slides forward as new data arrives.
     * Default: 200. Values below 2 are clamped.
     */
    maxVisibleBars?: number;
    /**
     * Initial visible range applied **before** the first paint after data
     * arrives. Same shape as `ChartInstance.setVisibleRange` (a bar count,
     * an explicit `{from, to}` window, or a `{from, bars}` warm-up pair).
     * Calling `setVisibleRange` after mount via `useEffect` runs post-paint
     * and visually re-zooms the chart on the next frame; this option folds
     * the same intent into the first render so the very first paint
     * already shows the requested window.
     *
     * One-shot — consumed by the first `onDataChanged` call that has data,
     * then cleared. Subsequent `setSeriesData` calls don't re-apply it.
     */
    initialRange?: VisibleRangeSpec;
  };
  /** Enable zoom, pan, and crosshair interactions. Defaults to true. */
  interactive?: boolean;
  /**
   * BCP 47 locale applied to the built-in time-axis / tooltip / crosshair
   * date-time formatting (e.g. `'de-DE'`). Default: `'en-US'`. Live —
   * `chart.setLocale()` updates it after construction. Ignored for a series
   * that installs a custom formatter via `chart.timeScale.setFormat()`.
   */
  locale?: string;
  /**
   * IANA timezone applied to the same built-in date-time formatting (e.g.
   * `'America/New_York'`). Default: the browser's local timezone. Live —
   * `chart.setTimeZone()` updates it after construction.
   */
  timeZone?: string;
  /** Background grid configuration. Default: `{ visible: true }`. */
  grid?: { visible: boolean };
  /**
   * Soft alpha fade applied at the edges of the plot area. Anything the main
   * layer draws inside a zone (series, grid, time-region bands) dissolves to
   * transparent as it approaches the edge: horizontally sliding under the
   * Y-axis labels on the right (`right`, **on by default**), toward a
   * floating Title / InfoBar at the top (`top`), or out the left edge
   * (`left`). The mask *erases* pixels rather than painting a cover color,
   * so it stays correct over any container background — including the
   * default CSS gradient. Live — `chart.setFade()` updates it after
   * construction.
   */
  fade?: FadeConfig;
  /**
   * Animation control. Grouped as `axis: { y, x, ticks }` (axis-side
   * behaviour), `toggle` (series visibility — alpha + Y refit), and
   * `series.{line,candlestick,bar,pie}` (per-series-type data tweens).
   * See {@link AnimationsConfig} for the full shape and defaults.
   *
   * Shorthands:
   * - `animations: true` (or omitted) uses built-in defaults.
   * - `animations: false` disables every animation category.
   *
   * Per-series options (`entryMs`, `smoothMs`, etc.) override chart-level
   * defaults unless the category is explicitly `false` — then the chart-
   * level gate wins.
   */
  animations?: boolean | AnimationsConfig;
  /**
   * Invoked after the user releases a pan/zoom gesture that pulled the
   * viewport past a data edge by more than 10% of the visible range. Hosts
   * typically respond by prefetching more history and calling
   * `ChartInstance.setEdgeState` to show a spinner or "no more data"
   * indicator at the corresponding edge.
   */
  onEdgeReached?: (info: EdgeReachedInfo) => void;
  /**
   * Runtime performance instrumentation. Opt-in — absent by default so the
   * hot render path stays free of timing/counting overhead, and so bundles
   * without instrumentation carry no perf code at all (the chart never
   * imports it; whatever you pass here is what ships).
   *
   * - omitted — no instrumentation, no HUD.
   * - `perfHud()` — monitor + visible HUD overlay (replaces the old `perf: true`).
   * - `PerfMonitor` instance — instrument without a HUD; useful when the host
   *   consumes stats via `monitor.onFrame` and renders its own UI, or when
   *   several charts share one telemetry sink.
   */
  perf?: PerfMonitor | PerfConfig;
}

// =============================================================================
// Edge fade mask
// =============================================================================

/** Shape of {@link ChartOptions.fade}. */
export interface FadeConfig {
  /** Fade-zone height in CSS pixels, measured down from the top of the plot
   *  area. `0` / omitted disables the mask. */
  top?: number;
  /**
   * Total width in CSS pixels of the horizontal dissolve at the right edge.
   * When automatic, the ramp is active only on charts with a visible time
   * series and finishes just inside the Y-axis column — 12px past the pane
   * edge, before the right-anchored label glyphs start. **Defaults to a 60px
   * ramp**; `0` disables. An explicit value also works on spatial-only charts
   * and with the Y axis hidden, ending at the canvas edge.
   */
  right?: number;
  /** Fade-zone width in CSS pixels at the left pane edge — content panning
   *  out to the left dissolves instead of hard-clipping at the canvas
   *  boundary. `0` / omitted disables. */
  left?: number;
}

export interface ResolvedFade {
  top: number;
  /** `null` = auto: the built-in lead-in + end-gap ramp (60px total). */
  right: number | null;
  left: number;
}

/** Non-negative finite pixels, or `0` for anything else. */
function resolveFadeSize(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return 0;

  return value;
}

/** Collapse the `fade` option into concrete pixel sizes — negative and
 *  non-finite values resolve to `0` (mask off). `right` is the one edge that
 *  is on by default: omitted resolves to `null`, meaning "match the Y-axis
 *  column width at draw time". */
export function resolveFade(input: ChartOptions['fade']): ResolvedFade {
  return {
    top: resolveFadeSize(input?.top),
    right: input?.right === undefined ? null : resolveFadeSize(input.right),
    left: resolveFadeSize(input?.left),
  };
}

// =============================================================================
// Perf
// =============================================================================

export interface ResolvedPerfOptions {
  monitor: PerfMonitor | null;
  /** True when the config constructed the monitor; false for caller-supplied
   *  monitors we must not destroy. */
  ownsMonitor: boolean;
  /** HUD mount carried by the config, or `null` when no HUD was requested. */
  hud: PerfConfig['hud'] | null;
}

/**
 * Collapse the `perf` option into a concrete monitor + HUD decision.
 * Returning `{ monitor: null }` preserves the zero-instrumentation path —
 * no Proxy, no timing, no HUD. Duck-types on purpose: an `instanceof
 * PerfMonitor` check would be a value import and drag the perf module into
 * every bundle.
 */
export function resolvePerfOptions(input: ChartOptions['perf']): ResolvedPerfOptions {
  if (!input) return { monitor: null, ownsMonitor: false, hud: null };

  if (typeof input !== 'object' || !('monitor' in input || 'recordFrame' in input)) {
    throw new Error(
      '[wick-charts] The `perf: true` / option-object forms were replaced by config factories — ' +
        'pass `perf: perfHud()` for a monitor with the HUD overlay, or a `PerfMonitor` instance ' +
        'for HUD-less instrumentation. Importing the factory is what pulls perf code into the bundle.',
    );
  }

  // Bare monitor — instrument without a HUD, caller owns the lifecycle.
  if ('recordFrame' in input) return { monitor: input, ownsMonitor: false, hud: null };

  return { monitor: input.monitor, ownsMonitor: input.ownsMonitor ?? false, hud: input.hud ?? null };
}

// =============================================================================
// Padding
// =============================================================================

export interface ResolvedPadding {
  top: number;
  bottom: number;
  right: HorizontalPadding;
  left: HorizontalPadding;
}

const DEFAULT_PADDING: ResolvedPadding = {
  top: 20,
  bottom: 20,
  right: { intervals: 3 },
  left: { intervals: 0 },
};

export function resolvePadding(input: ChartOptions['padding']): ResolvedPadding {
  return {
    top: input?.top ?? DEFAULT_PADDING.top,
    bottom: input?.bottom ?? DEFAULT_PADDING.bottom,
    right: input?.right ?? DEFAULT_PADDING.right,
    left: input?.left ?? DEFAULT_PADDING.left,
  };
}

/**
 * Shallow-compare two horizontal padding values (pixels or `{ intervals }`).
 * Used by `setPadding` to decide whether a viewport refit is needed.
 */
export function isSameHorizontalPadding(a: HorizontalPadding, b: HorizontalPadding): boolean {
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  if (typeof a === 'object' && typeof b === 'object') return a.intervals === b.intervals;

  return false;
}

// =============================================================================
// Viewport / data
// =============================================================================

/**
 * Resolve the `options.viewport.maxVisibleBars` config into a clamped
 * integer. Mirrors the validation the viewport used to do in its constructor.
 */
export function resolveMaxVisibleBars(input?: number): number {
  if (input === undefined) return DEFAULT_MAX_VISIBLE_BARS;
  if (!Number.isFinite(input)) return DEFAULT_MAX_VISIBLE_BARS;

  return Math.max(MIN_VISIBLE_BARS, Math.floor(input));
}
