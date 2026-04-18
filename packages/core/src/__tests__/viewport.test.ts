import { describe, expect, it } from 'vitest';

import { Viewport } from '../viewport';

const INTERVAL = 60_000; // 1 minute in ms

describe('Viewport', () => {
  it('setYRange adds pixel-based padding', () => {
    const v = new Viewport({ padding: { top: 20, bottom: 20 } });
    // chartHeight=200, range=100, so 20px = 10% of range = 10 data units
    v.setYRange(100, 200, 200);
    const r = v.yRange;
    expect(r.min).toBeLessThan(100);
    expect(r.max).toBeGreaterThan(200);
    expect(r.min).toBeCloseTo(90);
    expect(r.max).toBeCloseTo(210);
  });

  it('setYRange skips padding when fixed', () => {
    const v = new Viewport({ padding: { top: 20, bottom: 20 } });
    v.setYRange(0, 100, 200, true, false);
    expect(v.yRange.min).toBe(0); // fixed, no padding
    expect(v.yRange.max).toBeGreaterThan(100); // not fixed, padded
  });

  it('fitToData sets visible range', () => {
    const v = new Viewport();
    v.setDataInterval(INTERVAL);
    v.fitToData(1_000_000, 19_000_000, 800);
    const r = v.visibleRange;
    expect(r.from).toBeLessThanOrEqual(1_000_000);
    expect(r.to).toBeGreaterThanOrEqual(19_000_000);
  });

  it('fitToData with zero padding places last time exactly at right edge', () => {
    const v = new Viewport({ padding: { right: { intervals: 0 }, left: { intervals: 0 } } });
    v.setDataInterval(INTERVAL);
    v.fitToData(0, 18_000_000, 800);
    expect(v.visibleRange.to).toBe(18_000_000);
    expect(v.visibleRange.from).toBe(0);
  });

  it('fitToData right padding as pixels is proportional to chart width', () => {
    // right: 80px on 800px wide chart = 10% of dataSpan → pr = (80/800)*18_000_000 = 1_800_000
    const v = new Viewport({ padding: { right: 80, left: 0 } });
    v.setDataInterval(INTERVAL);
    v.fitToData(0, 18_000_000, 800);
    expect(v.visibleRange.to).toBeCloseTo(18_000_000 + 1_800_000, 0);
  });

  it('fitToData right padding as intervals adds N*dataInterval', () => {
    const v = new Viewport({ padding: { right: { intervals: 3 }, left: { intervals: 0 } } });
    v.setDataInterval(INTERVAL);
    v.fitToData(0, 18_000_000, 800);
    expect(v.visibleRange.to).toBeCloseTo(18_000_000 + 3 * INTERVAL, 0);
  });

  it('zoomAt changes range', () => {
    const v = new Viewport();
    v.setDataInterval(INTERVAL);
    v.fitToData(0, 18_000_000, 800);
    const before = { ...v.visibleRange };

    v.zoomAt(9_000_000, 0.5); // zoom in
    expect(v.visibleRange.to - v.visibleRange.from).toBeLessThan(before.to - before.from);
  });

  it('pan shifts range', () => {
    const v = new Viewport();
    v.setDataInterval(INTERVAL);
    v.setDataStart(0);
    v.setDataEnd(18_000_000);
    v.fitToData(0, 18_000_000, 800);
    // Zoom in so there is room to pan without hitting the right-edge clamp.
    v.zoomAt(9_000_000, 0.3);
    const before = { ...v.visibleRange };

    v.pan(INTERVAL); // shift by 1 bar — well inside bounds
    expect(v.visibleRange.from).toBeGreaterThan(before.from);
    expect(v.visibleRange.to).toBeGreaterThan(before.to);
    // range width should be preserved
    const widthBefore = before.to - before.from;
    const widthAfter = v.visibleRange.to - v.visibleRange.from;
    expect(widthAfter).toBeCloseTo(widthBefore);
  });

  it('pan clamps at data end plus right padding when scrolling too far right', () => {
    const v = new Viewport({ padding: { right: { intervals: 3 }, left: { intervals: 0 } } });
    v.setDataInterval(INTERVAL);
    v.setDataStart(0);
    v.setDataEnd(18_000_000);
    v.fitToData(0, 18_000_000, 800);
    v.zoomAt(9_000_000, 0.3);
    const widthBefore = v.visibleRange.to - v.visibleRange.from;
    const rightLimit = 18_000_000 + 3 * INTERVAL;

    // Attempt to pan way past the right edge — must be clamped, not allowed through.
    v.pan(100_000_000);

    expect(v.visibleRange.to).toBeCloseTo(rightLimit);
    // Width must be preserved when clamping so the chart doesn't squish.
    expect(v.visibleRange.to - v.visibleRange.from).toBeCloseTo(widthBefore);
  });

  it('pan resolves pixel-based right padding using current range width', () => {
    // right: 80px on 800px wide chart ≈ 10% of the current range
    const v = new Viewport({ padding: { right: 80, left: 0 } });
    v.setDataInterval(INTERVAL);
    v.setDataStart(0);
    v.setDataEnd(18_000_000);
    v.fitToData(0, 18_000_000, 800);
    v.zoomAt(9_000_000, 0.3);
    const widthBefore = v.visibleRange.to - v.visibleRange.from;
    const expectedPr = (80 / 800) * widthBefore;
    const rightLimit = 18_000_000 + expectedPr;

    v.pan(100_000_000, 800);

    expect(v.visibleRange.to).toBeCloseTo(rightLimit);
    expect(v.visibleRange.to - v.visibleRange.from).toBeCloseTo(widthBefore);
  });

  it('pan below the right limit is not clamped', () => {
    const v = new Viewport({ padding: { right: { intervals: 3 }, left: { intervals: 0 } } });
    v.setDataInterval(INTERVAL);
    v.setDataStart(0);
    v.setDataEnd(18_000_000);
    v.fitToData(0, 18_000_000, 800);
    v.zoomAt(9_000_000, 0.3);
    const before = { ...v.visibleRange };
    // Shift that still leaves us inside the allowed range.
    v.pan(INTERVAL * 2);
    expect(v.visibleRange.to).toBeCloseTo(before.to + 2 * INTERVAL);
    expect(v.visibleRange.from).toBeCloseTo(before.from + 2 * INTERVAL);
  });

  it('pan skips the clamp when right padding is pixel-based and chartWidth is not supplied', () => {
    // resolveHPad collapses pixel padding to 0 when chartWidth <= 0; clamping under
    // that resolution would sit at dataEnd (tighter than configured). The skip keeps
    // pan lenient in that edge case instead of over-clamping.
    const v = new Viewport({ padding: { right: 80, left: 0 } });
    v.setDataInterval(INTERVAL);
    v.setDataStart(0);
    v.setDataEnd(18_000_000);
    v.fitToData(0, 18_000_000, 800);
    v.zoomAt(9_000_000, 0.3);
    const before = { ...v.visibleRange };
    // No chartWidth passed — the pan must not collapse to `dataEnd`.
    v.pan(100_000_000);
    expect(v.visibleRange.to).toBeGreaterThan(18_000_000);
    expect(v.visibleRange.to - v.visibleRange.from).toBeCloseTo(before.to - before.from);
  });

  it('pan does not clamp when dataEnd is unset', () => {
    const v = new Viewport();
    v.setDataInterval(INTERVAL);
    v.fitToData(0, 18_000_000, 800);
    const before = { ...v.visibleRange };
    // No setDataEnd — panning must still work without any known right limit.
    v.pan(5_000_000);
    expect(v.visibleRange.to).toBeCloseTo(before.to + 5_000_000);
    expect(v.visibleRange.from).toBeCloseTo(before.from + 5_000_000);
  });

  it('scrollToEnd pins right edge after animation', () => {
    const v = new Viewport();
    v.setDataInterval(INTERVAL);
    v.fitToData(0, 18_000_000, 800);
    v.scrollToEnd(20_000_000, 800);
    // Tick past the animation duration (150ms)
    v.tick(performance.now() + 200);
    expect(v.visibleRange.to).toBeGreaterThanOrEqual(20_000_000);
  });

  it('applyRange accepts small datasets (< 10 bars)', () => {
    const v = new Viewport();
    v.setDataInterval(INTERVAL);
    // 5 bars = 300_000ms range — should be accepted (was rejected before fix)
    v.fitToData(0, 300_000, 800);
    const r = v.visibleRange;
    expect(r.to - r.from).toBeGreaterThan(0);
  });

  it('zoomAt refuses to go below 10 bars', () => {
    const v = new Viewport();
    v.setDataInterval(INTERVAL);
    v.fitToData(0, 18_000_000, 800);
    const before = { ...v.visibleRange };
    // Try to zoom in to less than 10 bars
    v.zoomAt(9_000_000, 0.01);
    // Range should not have changed — zoom rejected
    expect(v.visibleRange.from).toBe(before.from);
    expect(v.visibleRange.to).toBe(before.to);
  });

  it('scrollToEnd mid-animation resets duration to 150ms', () => {
    const v = new Viewport();
    v.setDataInterval(INTERVAL);
    // Set a non-zero initial range so fitToData animated branch triggers
    v.fitToData(1_000_000, 18_000_000, 800);
    // Start a long animation (450ms via fitToData animated)
    v.fitToData(1_000_000, 20_000_000, 800, true);
    expect(v.animating).toBe(true);

    // Retarget mid-animation — should use 150ms, not inherit 450ms
    v.scrollToEnd(22_000_000, 800);
    // Tick at 200ms — past 150ms but before 450ms
    v.tick(performance.now() + 200);
    expect(v.animating).toBe(false); // should have finished
    expect(v.visibleRange.to).toBeGreaterThanOrEqual(22_000_000);
  });

  it('getVisibleBarsCount returns correct count', () => {
    const v = new Viewport();
    v.setDataInterval(INTERVAL);
    v.fitToData(0, 18_000_000, 800);
    const bars = v.getVisibleBarsCount();
    expect(bars).toBeGreaterThan(0);
  });
});
