/**
 * computePan / computeZoom — pure-function unit tests.
 *
 * Guards two contracts:
 * - **Hard clamp:** pan/zoom never pushes the window past the "at least
 *   one data point visible" rule (`newFrom <= dataEnd && newTo >= dataStart`).
 *   No rubber-band, no overshoot.
 * - **AutoScroll-off:** any pan that moves `newTo` outside the live-tail
 *   tolerance (≈ dataEnd + paddingRight) flips autoscroll off; only an
 *   exact return to that position keeps it on.
 *
 * Zoom contract: cursor-anchored placement, sacrificed only when the
 * constraint would be violated. Sticky-follow (live tail lock) is the
 * caller's concern — see `Chart.zoomAt`.
 */
import { describe, expect, it } from 'vitest';

import { computePan, computeZoom } from '../pan-zoom-math';

const INTERVAL = 60_000;

const baseInput = {
  chartWidth: 800,
  dataInterval: INTERVAL,
  padding: { left: { intervals: 0 }, right: { intervals: 3 } } as const,
  dataStart: 0,
  dataEnd: 100 * INTERVAL,
};

describe('computeZoom — cursor anchor', () => {
  it('zoom-in with cursor at the right edge keeps the right edge ≈ to', () => {
    const currentLogical = { from: 20 * INTERVAL, to: 80 * INTERVAL };
    const result = computeZoom({
      ...baseInput,
      currentLogical,
      centerTime: 80 * INTERVAL,
      factor: 0.5,
    });

    expect(result.newLogical).not.toBeNull();
    const { from, to } = result.newLogical ?? { from: 0, to: 0 };

    expect(to).toBeCloseTo(80 * INTERVAL, -1);
    expect(to - from).toBeCloseTo(30 * INTERVAL, -1);
  });

  it('zoom-in with cursor in the middle centers the new window around centerTime', () => {
    const currentLogical = { from: 20 * INTERVAL, to: 80 * INTERVAL };
    const centerTime = 50 * INTERVAL;
    const result = computeZoom({
      ...baseInput,
      currentLogical,
      centerTime,
      factor: 0.5,
    });

    expect(result.newLogical).not.toBeNull();
    const { from, to } = result.newLogical ?? { from: 0, to: 0 };

    // ratioAnchor = 0.5 → window is symmetric around centerTime,
    // newRange = 30 * INTERVAL → from = 35*INTERVAL, to = 65*INTERVAL.
    expect(from).toBeCloseTo(35 * INTERVAL, -1);
    expect(to).toBeCloseTo(65 * INTERVAL, -1);
    expect((from + to) / 2).toBeCloseTo(centerTime, -1);
    // Right edge no longer pinned: the previous guardrail would have shifted
    // to = 80 * INTERVAL.
    expect(to).toBeLessThan(80 * INTERVAL);
  });

  it('zoom-in with cursor at the left edge anchors newFrom to centerTime', () => {
    const currentLogical = { from: 20 * INTERVAL, to: 80 * INTERVAL };
    const centerTime = 20 * INTERVAL;
    const result = computeZoom({
      ...baseInput,
      currentLogical,
      centerTime,
      factor: 0.5,
    });

    expect(result.newLogical).not.toBeNull();
    const { from, to } = result.newLogical ?? { from: 0, to: 0 };

    // ratioAnchor = 0 → newFrom = centerTime, newTo = newFrom + 30 * INTERVAL.
    expect(from).toBeCloseTo(20 * INTERVAL, -1);
    expect(to).toBeCloseTo(50 * INTERVAL, -1);
    // Previously the guardrail would have shifted right to keep `to ≈ 80 * INTERVAL`.
    expect(to).toBeLessThan(80 * INTERVAL);
  });

  it('zoom-out clamps the new range into the padded data span', () => {
    const currentLogical = { from: 30 * INTERVAL, to: 70 * INTERVAL };
    const result = computeZoom({
      ...baseInput,
      currentLogical,
      centerTime: 50 * INTERVAL,
      factor: 10,
    });

    expect(result.newLogical).not.toBeNull();
    const { from, to } = result.newLogical ?? { from: 0, to: 0 };

    // hardMaxRange = (dataEnd + rightPad) - dataStart = 103 * INTERVAL - 0.
    expect(to - from).toBeLessThanOrEqual(103 * INTERVAL + 1);
  });

  it('returns null for an invalid (collapsed) range', () => {
    const result = computeZoom({
      ...baseInput,
      currentLogical: { from: 50 * INTERVAL, to: 50 * INTERVAL },
      centerTime: 50 * INTERVAL,
      factor: 0.5,
    });

    expect(result.newLogical).toBeNull();
  });

  it('zoom-in past the 10-bar floor hard-stops at softMinRange (no rubber-band)', () => {
    const currentLogical = { from: 40 * INTERVAL, to: 52 * INTERVAL };
    const result = computeZoom({
      ...baseInput,
      currentLogical,
      centerTime: 46 * INTERVAL,
      // Factor that would naively produce a 6-bar window — clamped to 10.
      factor: 0.5,
    });

    expect(result.newLogical).not.toBeNull();
    const { from, to } = result.newLogical ?? { from: 0, to: 0 };
    expect(to - from).toBeCloseTo(10 * INTERVAL, -1);
  });

  it('zoom past dataStart preserves the cursor anchor (no shift, may leave data off-screen)', () => {
    // Viewport sits at the historical left boundary (newTo = dataStart),
    // cursor deep in the off-data zone to the left. Zoom must not shift
    // the window back toward the data — that's the jump-right-at-left-edge
    // UX bug. The pan path is what guarantees data visibility; zoom
    // honours the cursor and may produce an off-data window.
    const currentLogical = { from: -60 * INTERVAL, to: 0 };
    const centerTime = -40 * INTERVAL;
    const result = computeZoom({
      ...baseInput,
      currentLogical,
      centerTime,
      factor: 0.5,
    });

    expect(result.newLogical).not.toBeNull();
    const { from, to } = result.newLogical ?? { from: 0, to: 0 };
    // Span = factor * range, cursor anchor preserved at ratio 0.333.
    expect(to - from).toBeCloseTo(30 * INTERVAL, -1);
    const ratioBefore = (centerTime - currentLogical.from) / (currentLogical.to - currentLogical.from);
    const ratioAfter = (centerTime - from) / (to - from);
    expect(ratioAfter).toBeCloseTo(ratioBefore, 5);
  });

  it('zoom-out at the right edge does not shift the window (no auto-fit-to-data jump)', () => {
    // Viewport at the pan right boundary (newFrom = dataEnd), cursor at the
    // right edge. The old soft-bound clamp pulled the window leftward to
    // expose data — the "jumps left at right edge" UX bug. Cursor must win.
    const currentLogical = { from: 100 * INTERVAL, to: 130 * INTERVAL };
    const centerTime = 130 * INTERVAL;
    const result = computeZoom({
      ...baseInput,
      currentLogical,
      centerTime,
      factor: 2,
    });

    expect(result.newLogical).not.toBeNull();
    const { from, to } = result.newLogical ?? { from: 0, to: 0 };
    // Cursor stays at the right edge of the new window.
    expect(to).toBeCloseTo(centerTime, -1);
    // Window doubled in span.
    expect(to - from).toBeCloseTo(60 * INTERVAL, -1);
  });
});

describe('computePan — hard clamp', () => {
  const PAN_INPUT = {
    chartWidth: 800,
    dataInterval: INTERVAL,
    padding: { left: { intervals: 0 }, right: { intervals: 3 } } as const,
    dataStart: 0,
    dataEnd: 100 * INTERVAL,
  };

  it('pan right past dataEnd clamps newFrom to dataEnd (one point visible) and fires edgeReached', () => {
    const currentLogical = { from: 80 * INTERVAL, to: 110 * INTERVAL };
    const result = computePan({
      ...PAN_INPUT,
      currentLogical,
      timeDelta: 50 * INTERVAL,
    });

    expect(result.newLogical).not.toBeNull();
    const { from, to } = result.newLogical ?? { from: 0, to: 0 };
    expect(from).toBeCloseTo(100 * INTERVAL, -1);
    // Range preserved.
    expect(to - from).toBeCloseTo(30 * INTERVAL, -1);
    expect(result.edgeReached).not.toBeNull();
    expect(result.edgeReached?.side).toBe('right');
    expect(result.edgeReached?.boundaryTime).toBe(100 * INTERVAL);
  });

  it('pan left past dataStart clamps newTo to dataStart and fires edgeReached', () => {
    const currentLogical = { from: 10 * INTERVAL, to: 40 * INTERVAL };
    const result = computePan({
      ...PAN_INPUT,
      currentLogical,
      timeDelta: -100 * INTERVAL,
    });

    expect(result.newLogical).not.toBeNull();
    const { from, to } = result.newLogical ?? { from: 0, to: 0 };
    expect(to).toBeCloseTo(0, -1);
    expect(to - from).toBeCloseTo(30 * INTERVAL, -1);
    expect(result.edgeReached).not.toBeNull();
    expect(result.edgeReached?.side).toBe('left');
    expect(result.edgeReached?.boundaryTime).toBe(0);
  });

  it('pan inside bounds preserves the gesture and reports no edge reached', () => {
    const currentLogical = { from: 30 * INTERVAL, to: 60 * INTERVAL };
    const result = computePan({
      ...PAN_INPUT,
      currentLogical,
      timeDelta: 5 * INTERVAL,
    });

    expect(result.newLogical).not.toBeNull();
    const { from, to } = result.newLogical ?? { from: 0, to: 0 };
    expect(from).toBeCloseTo(35 * INTERVAL, -1);
    expect(to).toBeCloseTo(65 * INTERVAL, -1);
    expect(result.edgeReached).toBeNull();
  });

  it('pan that leaves the viewport at the live-tail position keeps autoScroll on', () => {
    // Currently exactly at live tail (newTo = dataEnd + 3 * INTERVAL).
    const currentLogical = { from: 73 * INTERVAL, to: 103 * INTERVAL };
    const result = computePan({
      ...PAN_INPUT,
      currentLogical,
      timeDelta: 0,
    });

    expect(result.autoScrollOff).toBe(false);
  });

  it('any pan that moves the viewport off the live-tail position flips autoScroll off', () => {
    const currentLogical = { from: 73 * INTERVAL, to: 103 * INTERVAL };
    const result = computePan({
      ...PAN_INPUT,
      currentLogical,
      // One full bar leftward — well past the half-bar live-tail tolerance.
      timeDelta: -1 * INTERVAL,
    });

    expect(result.autoScrollOff).toBe(true);
  });

  it('pan right to the hard-clamp boundary still flips autoScroll off (newFrom=dataEnd, far from live tail)', () => {
    // Old behavior: rubber-band kept dataEnd inside the window so
    // autoScroll stayed on; streaming then visibly dragged the viewport
    // back to the tail. Under the new rule the boundary is not the live
    // tail, so autoScroll flips off as soon as the user pushes past it.
    const currentLogical = { from: 73 * INTERVAL, to: 103 * INTERVAL };
    const result = computePan({
      ...PAN_INPUT,
      currentLogical,
      timeDelta: 200 * INTERVAL,
    });

    expect(result.newLogical).not.toBeNull();
    const { from } = result.newLogical ?? { from: 0, to: 0 };
    expect(from).toBeCloseTo(100 * INTERVAL, -1);
    expect(result.autoScrollOff).toBe(true);
  });

  it('returns null for an invalid (collapsed) range', () => {
    const result = computePan({
      ...PAN_INPUT,
      currentLogical: { from: 50 * INTERVAL, to: 50 * INTERVAL },
      timeDelta: 5 * INTERVAL,
    });

    expect(result.newLogical).toBeNull();
  });
});
