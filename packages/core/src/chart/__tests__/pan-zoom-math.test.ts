/**
 * computeZoom — pure-function unit tests.
 *
 * Guards the cursor-anchored zoom contract: the new window always anchors
 * around `centerTime` proportional to its position within `currentLogical`,
 * regardless of where in the range the cursor sits. Sticky-follow (live tail
 * lock) is the caller's concern — see `Chart.zoomAt`.
 */
import { describe, expect, it } from 'vitest';

import { computeZoom } from '../pan-zoom-math';

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
});
