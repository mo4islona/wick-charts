import type { VisibleRange } from '../types';
import type { WindowGeometry } from './render';

/** Width of the hit-test zone around each window edge handle, in media px. */
export const HANDLE_HIT_RADIUS = 8;

/** Kind of gesture the user just initiated on the navigator canvas. */
export type NavigatorGesture = 'pan' | 'resize-left' | 'resize-right';

export interface HitResult {
  /** How a subsequent drag should be interpreted. */
  gesture: NavigatorGesture;
  /**
   * When true, the pointerdown occurred outside the window — callers should
   * snap the window to the click position on pointerdown, then treat the
   * following drag as a pan from that new anchor.
   */
  snapToCenter: boolean;
}

/**
 * Classify a pointerdown at media-x coordinate `x` against the current window
 * geometry. Returns the gesture the subsequent drag will apply, and whether
 * the click landed outside the window (so the caller knows to snap first).
 */
export function hitTest(x: number, geom: WindowGeometry): HitResult {
  if (Math.abs(x - geom.left) <= HANDLE_HIT_RADIUS) {
    return { gesture: 'resize-left', snapToCenter: false };
  }
  if (Math.abs(x - geom.right) <= HANDLE_HIT_RADIUS) {
    return { gesture: 'resize-right', snapToCenter: false };
  }
  if (x > geom.left && x < geom.right) {
    return { gesture: 'pan', snapToCenter: false };
  }
  // Outside either edge — treat as click-to-center, subsequent drag pans.
  return { gesture: 'pan', snapToCenter: true };
}

/**
 * Compute the new visible range for a pan gesture — the window translates by
 * `(currentX - startX)` pixels, converted to time via the caller's pixels-per-
 * time factor. The span is preserved; the result is clamped so the window stays
 * inside `dataRange`.
 */
export function computePan(params: {
  startVisible: VisibleRange;
  deltaPx: number;
  pixelsPerTime: number;
  dataRange: VisibleRange;
}): VisibleRange {
  const { startVisible, deltaPx, pixelsPerTime, dataRange } = params;
  const span = startVisible.to - startVisible.from;
  const dt = deltaPx / pixelsPerTime;
  let from = startVisible.from + dt;
  let to = startVisible.to + dt;

  if (from < dataRange.from) {
    from = dataRange.from;
    to = from + span;
  }
  if (to > dataRange.to) {
    to = dataRange.to;
    from = to - span;
  }
  if (from < dataRange.from) from = dataRange.from;

  return { from, to };
}

/**
 * Compute the new visible range for a resize (edge-drag) gesture.
 *
 * Moving the left handle changes `from`, pins `to`. Moving the right handle
 * changes `to`, pins `from`. Results are clamped to `dataRange` on the edge
 * being moved, and a minimum-span floor prevents the window from collapsing
 * past `minSpan` (expressed in time units — typically `2 * dataInterval`).
 */
export function computeResize(params: {
  edge: 'left' | 'right';
  startVisible: VisibleRange;
  deltaPx: number;
  pixelsPerTime: number;
  dataRange: VisibleRange;
  minSpan: number;
}): VisibleRange {
  const { edge, startVisible, deltaPx, pixelsPerTime, dataRange, minSpan } = params;
  const dt = deltaPx / pixelsPerTime;

  if (edge === 'left') {
    let from = startVisible.from + dt;
    let to = startVisible.to;
    if (from < dataRange.from) from = dataRange.from;
    if (to - from < minSpan) from = to - minSpan;
    // `minSpan` may have pushed `from` below `dataRange.from`; pin it and
    // pull `to` along (clamped) so the range stays inside the data bounds.
    if (from < dataRange.from) {
      from = dataRange.from;
      to = Math.min(dataRange.to, from + minSpan);
    }

    return { from, to };
  }

  // edge === 'right'
  let from = startVisible.from;
  let to = startVisible.to + dt;
  if (to > dataRange.to) to = dataRange.to;
  if (to - from < minSpan) to = from + minSpan;
  // Mirror the left-edge fixup — `minSpan` may have pushed `to` past
  // `dataRange.to`; pin it and pull `from` back (clamped) to stay in bounds.
  if (to > dataRange.to) {
    to = dataRange.to;
    from = Math.max(dataRange.from, to - minSpan);
  }

  return { from, to };
}

/**
 * Snap the window so its centre lands on `time`, preserving span, clamped to
 * `dataRange`. Used on click-to-center outside the window.
 */
export function computeSnapCenter(params: {
  time: number;
  startVisible: VisibleRange;
  dataRange: VisibleRange;
}): VisibleRange {
  const { time, startVisible, dataRange } = params;
  const span = startVisible.to - startVisible.from;
  let from = time - span / 2;
  let to = from + span;

  if (from < dataRange.from) {
    from = dataRange.from;
    to = from + span;
  }
  if (to > dataRange.to) {
    to = dataRange.to;
    from = to - span;
  }
  if (from < dataRange.from) from = dataRange.from;

  return { from, to };
}
