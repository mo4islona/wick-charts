import type { BitmapCoordinateSpace } from '../../canvas-manager';
import { TimeScale } from '../../scales/time-scale';
import { YScale } from '../../scales/y-scale';
import type { OverlayRenderContext, SeriesRenderContext } from '../../series/types';
import { darkTheme } from '../../theme/dark';
import type { ChartTheme } from '../../theme/types';
import { type CanvasRecorder, createRecordingContext } from './recording-context';

// Module-level synthetic frame counter — bumps every `buildRenderContext`
// call so legacy tests that don't pass `frameId` still see distinct frames
// (otherwise per-series double-advance guards would short-circuit).
let nextFrameId = 0;
let lastFrameNow: number | null = null;

export interface BuildContextOptions {
  /** Viewport X range in data units. Defaults to [0, 100]. */
  timeRange?: { from: number; to: number };
  /** Viewport Y range. Defaults to [0, 100]. */
  yRange?: { min: number; max: number };
  /** CSS pixel size. Defaults to 800x400. */
  mediaWidth?: number;
  mediaHeight?: number;
  /** Device pixel ratio. Defaults to 1 (keeps assertions in a single coordinate space). */
  pixelRatio?: number;
  /** Spacing between data points (ms-equivalent units). Defaults to 1. */
  dataInterval?: number;
  /** Theme override. Defaults to darkTheme. */
  theme?: ChartTheme;
  /** Top/bottom padding in CSS pixels. Defaults to {top:0, bottom:0}. */
  padding?: { top: number; bottom: number };
  /** Frame clock `now`. Defaults to `performance.now()` so legacy tests that
   * mock `performance.now()` see synthetic time without per-call wiring. */
  now?: DOMHighResTimeStamp;
  /** Frame clock `dt` in seconds. Defaults to the wall-clock delta since the
   * previous `buildRenderContext` call (clamped to 50 ms) — mirrors what the
   * chart's animation clock does at runtime. */
  dt?: number;
  /** Frame clock `frameId`. Defaults to a monotonically increasing counter so
   * each `buildRenderContext` call looks like a distinct frame to per-frame
   * guards (live-tracking, Y-range smoothing). */
  frameId?: number;
}

/** Reset the helper's auto-incrementing frame state. Tests that rely on a
 * predictable frameId starting point call this in `beforeEach`. */
export function resetSyntheticFrameClock(): void {
  nextFrameId = 0;
  lastFrameNow = null;
}

export interface BuiltRenderContext {
  ctx: SeriesRenderContext;
  overlayCtx: (crosshair?: OverlayRenderContext['crosshair']) => OverlayRenderContext;
  spy: CanvasRecorder;
  timeScale: TimeScale;
  yScale: YScale;
}

/**
 * Build a fully-wired {@link SeriesRenderContext} around a recording canvas.
 * Tests call `renderer.render(ctx)` and assert against `spy.calls`. Scales are
 * real — `timeToBitmapX` / `valueToBitmapY` produce real coordinates — so
 * assertions about where primitives land are meaningful.
 */
export function buildRenderContext(opts: BuildContextOptions = {}): BuiltRenderContext {
  const {
    timeRange = { from: 0, to: 100 },
    yRange = { min: 0, max: 100 },
    mediaWidth = 800,
    mediaHeight = 400,
    pixelRatio = 1,
    dataInterval = 1,
    theme = darkTheme,
    padding = { top: 0, bottom: 0 },
  } = opts;

  // Auto-derive frame clock state from `performance.now()` (which legacy tests
  // mock). Each call advances `frameId` by 1 and computes `dt` from the gap
  // since the previous call. Explicit overrides win.
  const nowFromOpts = opts.now;
  const now = nowFromOpts ?? performance.now();
  const frameId = opts.frameId ?? ++nextFrameId;
  let dt = opts.dt;
  if (dt === undefined) {
    dt = lastFrameNow === null ? 0 : Math.min(0.05, (now - lastFrameNow) / 1000);
  }
  lastFrameNow = now;

  const { ctx: recordingCtx, spy } = createRecordingContext();

  const bitmapSize = { width: Math.round(mediaWidth * pixelRatio), height: Math.round(mediaHeight * pixelRatio) };
  const mediaSize = { width: mediaWidth, height: mediaHeight };
  const scope: BitmapCoordinateSpace = {
    context: recordingCtx,
    bitmapSize,
    mediaSize,
    horizontalPixelRatio: pixelRatio,
    verticalPixelRatio: pixelRatio,
  };

  const timeScale = new TimeScale();
  timeScale.update(timeRange, mediaWidth, pixelRatio);

  const yScale = new YScale();
  yScale.update(yRange, mediaHeight, pixelRatio);

  const ctx: SeriesRenderContext = {
    scope,
    timeScale,
    yScale,
    theme,
    dataInterval,
    padding,
    now,
    dt,
    frameId,
  };

  const overlayCtx: BuiltRenderContext['overlayCtx'] = (crosshair = null) => ({
    ...ctx,
    crosshair: crosshair ?? null,
  });

  return { ctx, overlayCtx, spy, timeScale, yScale };
}
