import { describe, expect, it } from 'vitest';

import { LineRenderer } from '../series/line';

describe('LineRenderer.getValueRange', () => {
  it('stacking: percent returns { min: 0, max: 100 }', () => {
    const r = new LineRenderer(2, { stacking: 'percent' });
    r.stores[0].setData([{ time: 1, value: 10 }]);
    r.stores[1].setData([{ time: 1, value: 20 }]);
    expect(r.getValueRange(0, 100)).toEqual({ min: 0, max: 100 });
  });

  it('single layer (layerCount=1) returns null', () => {
    const r = new LineRenderer(1);
    r.stores[0].setData([
      { time: 1, value: 5 },
      { time: 2, value: 15 },
    ]);
    expect(r.getValueRange(0, 100)).toBeNull();
  });

  it('stacking: off multi-layer returns union of all layers min/max', () => {
    const r = new LineRenderer(2, { stacking: 'off' });
    r.stores[0].setData([
      { time: 1, value: 10 },
      { time: 2, value: 20 },
    ]);
    r.stores[1].setData([
      { time: 1, value: 5 },
      { time: 2, value: 30 },
    ]);
    expect(r.getValueRange(0, 100)).toEqual({ min: 5, max: 30 });
  });

  it('stacking: normal multi-layer returns stacked totals', () => {
    const r = new LineRenderer(2, { stacking: 'normal' });
    r.stores[0].setData([
      { time: 1, value: 10 },
      { time: 2, value: 20 },
    ]);
    r.stores[1].setData([
      { time: 1, value: 5 },
      { time: 2, value: 30 },
    ]);
    // time 1: posSum = 10 + 5 = 15
    // time 2: posSum = 20 + 30 = 50
    expect(r.getValueRange(0, 100)).toEqual({ min: 0, max: 50 });
  });

  it('stacking: normal with mixed positive/negative values', () => {
    const r = new LineRenderer(3, { stacking: 'normal' });
    r.stores[0].setData([{ time: 1, value: 10 }]);
    r.stores[1].setData([{ time: 1, value: -7 }]);
    r.stores[2].setData([{ time: 1, value: 5 }]);
    // posSum = 10 + 5 = 15, negSum = -7
    expect(r.getValueRange(0, 100)).toEqual({ min: -7, max: 15 });
  });

  it('empty stores return null', () => {
    const r = new LineRenderer(2, { stacking: 'off' });
    expect(r.getValueRange(0, 100)).toBeNull();
  });

  it('empty stores with normal stacking return null', () => {
    const r = new LineRenderer(2, { stacking: 'normal' });
    expect(r.getValueRange(0, 100)).toBeNull();
  });

  it('uses visible data range from stores', () => {
    const r = new LineRenderer(2, { stacking: 'off' });
    r.stores[0].setData([
      { time: 10, value: 5 },
      { time: 20, value: 8 },
    ]);
    r.stores[1].setData([
      { time: 10, value: 1 },
      { time: 20, value: 12 },
    ]);
    const result = r.getValueRange(5, 25);
    expect(result).not.toBeNull();
    expect(result!.min).toBeLessThanOrEqual(1);
    expect(result!.max).toBeGreaterThanOrEqual(12);
  });

  it('stacking: normal all negative values', () => {
    const r = new LineRenderer(2, { stacking: 'normal' });
    r.stores[0].setData([{ time: 1, value: -10 }]);
    r.stores[1].setData([{ time: 1, value: -5 }]);
    // negSum = -10 + -5 = -15, posSum = 0
    // max (0) > min (-15) => { min: -15, max: 0 }
    expect(r.getValueRange(0, 100)).toEqual({ min: -15, max: 0 });
  });
});
