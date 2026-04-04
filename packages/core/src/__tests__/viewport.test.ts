import { describe, expect, it } from 'vitest';

import { Viewport } from '../viewport';

describe('Viewport', () => {
  it('setYRange adds padding', () => {
    const v = new Viewport({ yPadding: 0.1 });
    v.setYRange(100, 200);
    const r = v.yRange;
    expect(r.min).toBeLessThan(100);
    expect(r.max).toBeGreaterThan(200);
    // 10% of 100 range = 10
    expect(r.min).toBeCloseTo(90);
    expect(r.max).toBeCloseTo(210);
  });

  it('setYRange skips padding when fixed', () => {
    const v = new Viewport({ yPadding: 0.1 });
    v.setYRange(0, 100, true, false);
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

  it('scrollToEnd pins right edge', () => {
    const v = new Viewport();
    v.setDataInterval(60);
    v.fitToData(0, 18000);
    v.scrollToEnd(20000);
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

  it('getVisibleBarsCount returns correct count', () => {
    const v = new Viewport();
    v.setDataInterval(60);
    v.fitToData(0, 18000);
    const bars = v.getVisibleBarsCount();
    expect(bars).toBeGreaterThan(0);
  });
});
