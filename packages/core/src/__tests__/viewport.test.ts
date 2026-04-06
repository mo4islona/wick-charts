import { describe, expect, it } from 'vitest';

import { Viewport } from '../viewport';

describe('Viewport', () => {
  it('setYRange adds pixel-based padding', () => {
    const v = new Viewport({ yPadding: 20 });
    // chartHeight=200, range=100, so 20px = 10% of range = 10 data units
    v.setYRange(100, 200, 200);
    const r = v.yRange;
    expect(r.min).toBeLessThan(100);
    expect(r.max).toBeGreaterThan(200);
    expect(r.min).toBeCloseTo(90);
    expect(r.max).toBeCloseTo(210);
  });

  it('setYRange skips padding when fixed', () => {
    const v = new Viewport({ yPadding: 20 });
    v.setYRange(0, 100, 200, true, false);
    expect(v.yRange.min).toBe(0); // fixed, no padding
    expect(v.yRange.max).toBeGreaterThan(100); // not fixed, padded
  });

  it('fitToData sets visible range', () => {
    const v = new Viewport();
    v.setDataInterval(60);
    v.fitToData(1000, 19000);
    const r = v.visibleRange;
    expect(r.from).toBeLessThanOrEqual(1000);
    expect(r.to).toBeGreaterThanOrEqual(19000);
  });

  it('zoomAt changes range', () => {
    const v = new Viewport();
    v.setDataInterval(60);
    v.fitToData(0, 18000);
    const before = { ...v.visibleRange };

    v.zoomAt(9000, 0.5); // zoom in
    expect(v.visibleRange.to - v.visibleRange.from).toBeLessThan(before.to - before.from);
  });

  it('pan shifts range', () => {
    const v = new Viewport();
    v.setDataInterval(60);
    v.fitToData(0, 18000);
    const before = { ...v.visibleRange };

    v.pan(1000);
    expect(v.visibleRange.from).toBeGreaterThan(before.from);
    expect(v.visibleRange.to).toBeGreaterThan(before.to);
    // range width should be preserved
    const widthBefore = before.to - before.from;
    const widthAfter = v.visibleRange.to - v.visibleRange.from;
    expect(widthAfter).toBeCloseTo(widthBefore);
  });

  it('scrollToEnd pins right edge after animation', () => {
    const v = new Viewport();
    v.setDataInterval(60);
    v.fitToData(0, 18000);
    v.scrollToEnd(20000);
    // Tick past the animation duration (150ms)
    v.tick(performance.now() + 200);
    expect(v.visibleRange.to).toBeGreaterThanOrEqual(20000);
  });

  it('setPadding changes pad values', () => {
    const v = new Viewport();
    v.setDataInterval(60);
    v.setPadding(0, 0);
    v.fitToData(0, 18000);
    // with 0 padding, to should be exactly 18000
    expect(v.visibleRange.to).toBe(18000);
  });

  it('applyRange accepts small datasets (< 10 bars)', () => {
    const v = new Viewport();
    v.setDataInterval(60);
    // 5 bars = 300s range — should be accepted (was rejected before fix)
    v.fitToData(0, 300);
    const r = v.visibleRange;
    expect(r.to - r.from).toBeGreaterThan(0);
  });

  it('zoomAt refuses to go below 10 bars', () => {
    const v = new Viewport();
    v.setDataInterval(60);
    v.fitToData(0, 18000);
    const before = { ...v.visibleRange };
    // Try to zoom in to less than 10 bars
    v.zoomAt(9000, 0.01);
    // Range should not have changed — zoom rejected
    expect(v.visibleRange.from).toBe(before.from);
    expect(v.visibleRange.to).toBe(before.to);
  });

  it('scrollToEnd mid-animation resets duration to 150ms', () => {
    const v = new Viewport();
    v.setDataInterval(60);
    // Set a non-zero initial range so fitToData animated branch triggers
    v.fitToData(1000, 18000);
    // Start a long animation (450ms via fitToData animated)
    v.fitToData(1000, 20000, true);
    expect(v.animating).toBe(true);

    // Retarget mid-animation — should use 150ms, not inherit 450ms
    v.scrollToEnd(22000);
    // Tick at 200ms — past 150ms but before 450ms
    v.tick(performance.now() + 200);
    expect(v.animating).toBe(false); // should have finished
    expect(v.visibleRange.to).toBeGreaterThanOrEqual(22000);
  });

  it('getVisibleBarsCount returns correct count', () => {
    const v = new Viewport();
    v.setDataInterval(60);
    v.fitToData(0, 18000);
    const bars = v.getVisibleBarsCount();
    expect(bars).toBeGreaterThan(0);
  });
});
