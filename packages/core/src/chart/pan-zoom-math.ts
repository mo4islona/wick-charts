/**
 * Pure pan / zoom math for the viewport's logical X range. Extracted out
 * of `Viewport` so the pan clamp and edge-reached classification can be
 * unit-tested in isolation and so the next refactor step can move
 * data-anchor state (dataStart / dataEnd / padding / dataInterval) onto
 * the chart without dragging the class along.
 *
 * Inputs are explicit (no class fields). Outputs include flags (`autoScrollOff`)
 * the caller applies as side effects.
 */

import type { HorizontalPadding, XRange } from '../types';
import type { EdgeReachedInfo } from './options';
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

export interface PanResult {
  /** New logical X range to commit, or `null` if the input range is invalid. */
  newLogical: XRange | null;
  /** When `true`, the viewport is no longer at the live-tail position — caller should disable autoScroll. */
  autoScrollOff: boolean;
}

/** Share of the view a drag keeps covered by data: well past {@link EDGE_REACHED_SHARE}, short of one stray point. */
export const PAN_DATA_SHARE = 0.5;

/**
 * Shift the visible range by a time delta. Clamped so data keeps covering
 * {@link PAN_DATA_SHARE} of the view (all of the data when it spans less):
 * `newFrom <= dataEnd - keep` and `newTo >= dataStart + keep`. A wide
 * padding moves the bound out to twice the {@link EDGE_REACHED_SHARE} trigger
 * past the padded edge, so a drag can always fire `onEdgeReached`. No
 * rubber-band, no overshoot — the viewport stops dead at the boundary. A view
 * already past the boundary (a zoom at the cursor can leave one there) may
 * pan back toward the data but no further away, so it never jumps.
 *
 * A pan that lands the viewport off the live-tail position (newTo no
 * longer ≈ dataEnd + paddingRight) flips autoscroll off; staying
 * within tolerance keeps it on.
 */
export function computePan(input: PanInput): PanResult {
  const { currentLogical, timeDelta, chartWidth, dataInterval, padding, dataStart, dataEnd } = input;
  const { from, to } = currentLogical;
  const range = to - from;
  if (range <= 0) {
    return { newLogical: null, autoScrollOff: false };
  }

  let newFrom = from + timeDelta;
  let newTo = to + timeDelta;

  const span = dataStart !== null && dataEnd !== null ? dataEnd - dataStart : 0;
  const keep = Math.min(range * PAN_DATA_SHARE, Math.max(span, 0));
  const soft = computeSoftBounds({ range, chartWidth, dataInterval, padding, dataStart, dataEnd });
  const edgeReach = range * EDGE_REACHED_SHARE * 2;

  if (dataEnd !== null) {
    const edgeFrom = soft.right === null ? Number.NEGATIVE_INFINITY : soft.right + edgeReach - range;
    const maxFrom = Math.max(dataEnd - keep, edgeFrom, from);
    const excess = newFrom - maxFrom;
    if (excess > 0) {
      newFrom -= excess;
      newTo -= excess;
    }
  }

  if (dataStart !== null) {
    const edgeTo = soft.left === null ? Number.POSITIVE_INFINITY : soft.left - edgeReach + range;
    const minTo = Math.min(dataStart + keep, edgeTo, to);
    const excess = minTo - newTo;
    if (excess > 0) {
      newFrom += excess;
      newTo += excess;
    }
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
  };
}

/** How far past a padded data edge, as a share of the visible range, a released gesture must leave the view. */
export const EDGE_REACHED_SHARE = 0.1;

export interface EdgeOvershootInput {
  logical: XRange;
  chartWidth: number;
  dataInterval: number;
  padding: { left: HorizontalPadding; right: HorizontalPadding };
  dataStart: number | null;
  dataEnd: number | null;
}

/**
 * The data edge the view sits past by more than {@link EDGE_REACHED_SHARE} of
 * its range, measured from the padded edge, or `null`. The left (history) side
 * wins when the view hangs past both.
 */
export function computeEdgeOvershoot(input: EdgeOvershootInput): EdgeReachedInfo | null {
  const { logical, chartWidth, dataInterval, padding, dataStart, dataEnd } = input;
  const range = logical.to - logical.from;
  if (range <= 0) return null;

  const soft = computeSoftBounds({ range, chartWidth, dataInterval, padding, dataStart, dataEnd });
  const threshold = range * EDGE_REACHED_SHARE;

  const leftOvershoot = soft.left === null ? 0 : soft.left - logical.from;
  if (dataStart !== null && leftOvershoot > threshold) {
    return { side: 'left', overshoot: leftOvershoot, boundaryTime: dataStart };
  }

  const rightOvershoot = soft.right === null ? 0 : logical.to - soft.right;
  if (dataEnd !== null && rightOvershoot > threshold) {
    return { side: 'right', overshoot: rightOvershoot, boundaryTime: dataEnd };
  }

  return null;
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
 *   the data back into focus. The pan path keeps data in view on its
 *   own; zoom should not fight the cursor.
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
