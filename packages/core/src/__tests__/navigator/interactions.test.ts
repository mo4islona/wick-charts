import { describe, expect, it } from 'vitest';

import { HANDLE_HIT_RADIUS, computePan, computeResize, computeSnapCenter, hitTest } from '../../navigator/interactions';

const GEOM = { left: 100, right: 200, width: 100 };
const DATA = { from: 0, to: 1000 };

describe('hitTest', () => {
  it('returns resize-left on the left handle', () => {
    expect(hitTest(100, GEOM).gesture).toBe('resize-left');
    expect(hitTest(100 - HANDLE_HIT_RADIUS, GEOM).gesture).toBe('resize-left');
    expect(hitTest(100 + HANDLE_HIT_RADIUS, GEOM).gesture).toBe('resize-left');
  });

  it('returns resize-right on the right handle', () => {
    expect(hitTest(200, GEOM).gesture).toBe('resize-right');
    expect(hitTest(200 + HANDLE_HIT_RADIUS, GEOM).gesture).toBe('resize-right');
  });

  it('returns pan inside the window body', () => {
    const hit = hitTest(150, GEOM);
    expect(hit.gesture).toBe('pan');
    expect(hit.snapToCenter).toBe(false);
  });

  it('returns pan + snapToCenter outside the window', () => {
    const hit = hitTest(20, GEOM);
    expect(hit.gesture).toBe('pan');
    expect(hit.snapToCenter).toBe(true);
  });
});

describe('computePan', () => {
  const startVisible = { from: 300, to: 500 };
  const pixelsPerTime = 1; // 1 px = 1 time unit

  it('translates the window by deltaPx / pixelsPerTime', () => {
    const out = computePan({ startVisible, deltaPx: 50, pixelsPerTime, dataRange: DATA });
    expect(out).toEqual({ from: 350, to: 550 });
  });

  it('clamps against the left data bound while preserving span', () => {
    const out = computePan({ startVisible, deltaPx: -500, pixelsPerTime, dataRange: DATA });
    expect(out.from).toBe(0);
    expect(out.to - out.from).toBe(200);
  });

  it('clamps against the right data bound while preserving span', () => {
    const out = computePan({ startVisible, deltaPx: 5000, pixelsPerTime, dataRange: DATA });
    expect(out.to).toBe(1000);
    expect(out.to - out.from).toBe(200);
  });
});

describe('computeResize', () => {
  const startVisible = { from: 300, to: 500 };

  it('moves left edge, pins right', () => {
    const out = computeResize({
      edge: 'left',
      startVisible,
      deltaPx: -100,
      pixelsPerTime: 1,
      dataRange: DATA,
      minSpan: 10,
    });
    expect(out).toEqual({ from: 200, to: 500 });
  });

  it('moves right edge, pins left', () => {
    const out = computeResize({
      edge: 'right',
      startVisible,
      deltaPx: 100,
      pixelsPerTime: 1,
      dataRange: DATA,
      minSpan: 10,
    });
    expect(out).toEqual({ from: 300, to: 600 });
  });

  it('enforces minSpan when dragging the left edge past the right', () => {
    const out = computeResize({
      edge: 'left',
      startVisible,
      deltaPx: 500, // would push from past to
      pixelsPerTime: 1,
      dataRange: DATA,
      minSpan: 50,
    });
    expect(out.to - out.from).toBeGreaterThanOrEqual(50);
    expect(out.to).toBe(500);
  });

  it('clamps to dataRange when left drags left past the start', () => {
    const out = computeResize({
      edge: 'left',
      startVisible,
      deltaPx: -5000,
      pixelsPerTime: 1,
      dataRange: DATA,
      minSpan: 10,
    });
    expect(out.from).toBe(DATA.from);
    expect(out.to).toBe(500);
  });

  it('keeps the left edge inside dataRange even when minSpan would push it out', () => {
    // Right edge is anchored at 80 (just inside the data range), and the
    // minimum span (200) is wider than the distance from `to` to dataRange.from.
    // Without the post-`minSpan` re-clamp, `from = to - minSpan = -120` would
    // fall below dataRange.from.
    const out = computeResize({
      edge: 'left',
      startVisible: { from: 50, to: 80 },
      deltaPx: -10,
      pixelsPerTime: 1,
      dataRange: DATA,
      minSpan: 200,
    });
    expect(out.from).toBeGreaterThanOrEqual(DATA.from);
    expect(out.to).toBeLessThanOrEqual(DATA.to);
    expect(out.to - out.from).toBeGreaterThanOrEqual(0);
  });

  it('keeps the right edge inside dataRange even when minSpan would push it out', () => {
    // Mirror of the above for the right edge — anchored near dataRange.to.
    const out = computeResize({
      edge: 'right',
      startVisible: { from: 920, to: 950 },
      deltaPx: 10,
      pixelsPerTime: 1,
      dataRange: DATA,
      minSpan: 200,
    });
    expect(out.from).toBeGreaterThanOrEqual(DATA.from);
    expect(out.to).toBeLessThanOrEqual(DATA.to);
    expect(out.to - out.from).toBeGreaterThanOrEqual(0);
  });
});

describe('computeSnapCenter', () => {
  it('centers the window on the target time, preserving span', () => {
    const out = computeSnapCenter({
      time: 700,
      startVisible: { from: 100, to: 300 },
      dataRange: DATA,
    });
    expect(out.to - out.from).toBe(200);
    // Center of [600, 800] is 700.
    expect((out.from + out.to) / 2).toBe(700);
  });

  it('clamps against left bound when target is near zero', () => {
    const out = computeSnapCenter({
      time: 10,
      startVisible: { from: 100, to: 300 },
      dataRange: DATA,
    });
    expect(out.from).toBe(0);
    expect(out.to - out.from).toBe(200);
  });

  it('clamps against right bound when target is past the end', () => {
    const out = computeSnapCenter({
      time: 1200,
      startVisible: { from: 100, to: 300 },
      dataRange: DATA,
    });
    expect(out.to).toBe(1000);
    expect(out.to - out.from).toBe(200);
  });
});
