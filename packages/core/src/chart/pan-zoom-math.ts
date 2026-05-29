/**
 * Pure pan / zoom math for the viewport's logical X range. Extracted out
 * of `Viewport` so the hard-clamp and edge-reached classification can be
 * unit-tested in isolation and so the next refactor step can move
 * data-anchor state (dataStart / dataEnd / padding / dataInterval) onto
 * the chart without dragging the class along.
 *
 * Inputs are explicit (no class fields). Outputs include flags (`autoScrollOff`,
 * `edgeReached`) the caller applies as side effects.
 */

import type { HorizontalPadding, XRange } from '../types';
import { resolvePaddingTime } from './viewport-padding';

/** Default maximum visible bars before fitToData caps and tail-scroll takes over. */
export const DEFAULT_MAX_VISIBLE_BARS = 200;
/** Minimum allowed `maxVisibleBars` — matches the visible-bar floor below which
 *  the viewport refuses to render. */
export const MIN_VISIBLE_BARS = 2;

export interface SoftBounds {
  left: number | null;
  right: number | null;
}

export interface SoftBoundsInput {
  range: number;
  chartWidth: number;
  dataInterval: number;
  padding: { left: HorizontalPadding; right: HorizontalPadding };
  dataStart: number | null;
  dataEnd: number | null;
}

/**
 * Compute the left / right soft pan-time bound (data edge + padding).
 * Used to detect the "live tail" position for autoScroll-engagement —
 * not for clamping the user's pan/zoom. Returns `null` on a side
 * whose data boundary is unset or whose padding requires a chart width
 * that isn't available yet.
 */
export function computeSoftBounds(input: SoftBoundsInput): SoftBounds {
  const { range, chartWidth, dataInterval, padding, dataStart, dataEnd } = input;
  // Pixel padding of 0 is trivially resolvable without a chart width.
  const resolvable = (pad: HorizontalPadding) => typeof pad === 'object' || pad === 0 || chartWidth > 0;

  const left =
    dataStart !== null && resolvable(padding.left)
      ? dataStart - resolvePaddingTime(padding.left, range, dataInterval, chartWidth)
      : null;
  const right =
    dataEnd !== null && resolvable(padding.right)
      ? dataEnd + resolvePaddingTime(padding.right, range, dataInterval, chartWidth)
      : null;

  return { left, right };
}

/** Minimum visible range (zoom-in ceiling). Expressed as 10 bars. */
export function softMinRange(dataInterval: number): number {
  return 10 * dataInterval;
}

export interface SoftMaxRangeInput {
  dataInterval: number;
  padding: { left: HorizontalPadding; right: HorizontalPadding };
  dataStart: number | null;
  dataEnd: number | null;
}

/**
 * Maximum visible range (zoom-out floor). Returns `null` when data bounds
 * are unknown — no hard ceiling in that case.
 */
export function softMaxRange(input: SoftMaxRangeInput): number | null {
  const { dataInterval, padding, dataStart, dataEnd } = input;
  if (dataStart === null || dataEnd === null) return null;

  const span = dataEnd - dataStart;
  if (span <= 0) return null;

  const leftPad = typeof padding.left === 'object' ? padding.left.intervals * dataInterval : null;
  const rightPad = typeof padding.right === 'object' ? padding.right.intervals * dataInterval : null;

  if (leftPad !== null || rightPad !== null) {
    return span + (leftPad ?? 0) + (rightPad ?? 0);
  }

  return span + dataInterval * 5;
}

/**
 * Live-tail tolerance: how close `newTo` must be to `dataEnd + rightPad`
 * for the viewport to count as "at the live tail" (autoScroll stays on /
 * re-engages). Half a bar — under the user's perceptual threshold but
 * tight enough that any real pan flips autoScroll off immediately.
 */
function liveTailTolerance(dataInterval: number): number {
  return dataInterval * 0.5;
}

export interface PanInput {
  currentLogical: XRange;
  timeDelta: number;
  chartWidth: number;
  dataInterval: number;
  padding: { left: HorizontalPadding; right: HorizontalPadding };
  dataStart: number | null;
  dataEnd: number | null;
}

export interface EdgeReachedInfo {
  side: 'left' | 'right';
  overshoot: number;
  boundaryTime: number;
}

export interface PanResult {
  /** New logical X range to commit, or `null` if the input range is invalid. */
  newLogical: XRange | null;
  /** When `true`, the viewport is no longer at the live-tail position — caller should disable autoScroll. */
  autoScrollOff: boolean;
  /** When set, caller should fire its `edgeReached` event with this payload. */
  edgeReached: EdgeReachedInfo | null;
}

/**
 * Shift the visible range by a time delta. Hard-clamped to the rule
 * "at least one data point stays visible": `newFrom <= dataEnd` (the
 * last point can sit at the very left edge) and `newTo >= dataStart`
 * (the first point can sit at the very right edge). No rubber-band,
 * no overshoot — the viewport stops dead at the boundary.
 *
 * A pan that lands the viewport off the live-tail position (newTo no
 * longer ≈ dataEnd + paddingRight) flips autoscroll off; staying
 * within tolerance keeps it on.
 *
 * `edgeReached` fires whenever the clamp actually trims the gesture —
 * i.e., the user tried to push past the boundary. Consumers wire this
 * to history-load triggers.
 */
export function computePan(input: PanInput): PanResult {
  const { currentLogical, timeDelta, chartWidth, dataInterval, padding, dataStart, dataEnd } = input;
  const { from, to } = currentLogical;
  const range = to - from;
  if (range <= 0) {
    return { newLogical: null, autoScrollOff: false, edgeReached: null };
  }

  let newFrom = from + timeDelta;
  let newTo = to + timeDelta;

  let edgeReached: EdgeReachedInfo | null = null;

  // Hard clamp: keep at least one data point on screen.
  if (dataEnd !== null && newFrom > dataEnd) {
    const excess = newFrom - dataEnd;
    newFrom -= excess;
    newTo -= excess;
    edgeReached = { side: 'right', overshoot: excess, boundaryTime: dataEnd };
  }
  if (dataStart !== null && newTo < dataStart) {
    const excess = dataStart - newTo;
    newFrom += excess;
    newTo += excess;
    // Left clamp overrides a same-frame right clamp (range > data span):
    // honour the more recent collision so consumers fire one event per pan.
    edgeReached = { side: 'left', overshoot: excess, boundaryTime: dataStart };
  }

  // AutoScroll stays on only while the viewport sits at the live-tail
  // position (newTo ≈ dataEnd + paddingRight). Any deliberate pan moves
  // newTo outside the tolerance and flips it off.
  const rightPadTime =
    dataEnd !== null && (typeof padding.right === 'object' || padding.right === 0 || chartWidth > 0)
      ? resolvePaddingTime(padding.right, newTo - newFrom, dataInterval, chartWidth)
      : 0;
  const tolerance = liveTailTolerance(dataInterval);
  const atLiveTail = dataEnd !== null && Math.abs(newTo - (dataEnd + rightPadTime)) < tolerance;

  return {
    newLogical: { from: newFrom, to: newTo },
    autoScrollOff: !atLiveTail,
    edgeReached,
  };
}

export interface ZoomInput {
  currentLogical: XRange;
  centerTime: number;
  factor: number;
  chartWidth: number;
  dataInterval: number;
  padding: { left: HorizontalPadding; right: HorizontalPadding };
  dataStart: number | null;
  dataEnd: number | null;
}

export interface ZoomResult {
  /** New logical X range to commit, or `null` if the input range is invalid. */
  newLogical: XRange | null;
}

/**
 * Zoom in / out around a time anchor. `factor < 1` zooms in, `> 1` zooms out.
 *
 * - Zoom anchors to `centerTime`. Sticky-follow positioning (when autoScroll
 *   is on) is the caller's concern — see `Chart.zoomAt`.
 * - Zoom-in is hard-clamped at the 10-bar floor (`softMinRange`).
 * - Zoom-out is hard-clamped at the padded data span — beyond that the
 *   data shrinks to a useless dot.
 * - No position clamping: the cursor anchor always wins. Zooming past a
 *   data edge leaves empty space on one side of the window; pan to bring
 *   the data back into focus. The pan path enforces the "at least one
 *   point visible" rule on its own; zoom should not fight the cursor.
 * - Zoom does NOT toggle autoScroll — that's a pan-only concern.
 */
export function computeZoom(input: ZoomInput): ZoomResult {
  const { currentLogical, centerTime, factor, chartWidth, dataInterval, padding, dataStart, dataEnd } = input;
  const { from, to } = currentLogical;
  const range = to - from;
  if (range <= 0) {
    return { newLogical: null };
  }

  const softMin = softMinRange(dataInterval);
  const { left: softLeft, right: softRight } = computeSoftBounds({
    range,
    chartWidth,
    dataInterval,
    padding,
    dataStart,
    dataEnd,
  });
  const hardMaxRange =
    softLeft !== null && softRight !== null
      ? softRight - softLeft
      : softMaxRange({ dataInterval, padding, dataStart, dataEnd });

  let newRange = range * factor;

  // Zoom-in: hard-stop at the 10-bar floor.
  if (newRange < softMin) newRange = softMin;
  // Zoom-out: hard-cap at the padded data span.
  if (factor > 1 && hardMaxRange !== null && newRange > hardMaxRange) {
    newRange = hardMaxRange;
  }

  const ratioAnchor = (centerTime - from) / range;
  const newFrom = centerTime - ratioAnchor * newRange;
  const newTo = newFrom + newRange;

  return { newLogical: { from: newFrom, to: newTo } };
}
