import { describe, expect, it } from 'vitest';

import { TimeSeriesStore } from '../data/store';

interface Point {
  time: number;
  value: number;
}

function makeStore(points?: Point[]) {
  const s = new TimeSeriesStore<Point>();
  if (points) s.setData(points);
  return s;
}

describe('TimeSeriesStore', () => {
  it('starts empty', () => {
    const s = makeStore();
    expect(s.length).toBe(0);
    expect(s.isEmpty()).toBe(true);
    expect(s.first()).toBeUndefined();
    expect(s.last()).toBeUndefined();
  });

  it('setData sorts by time', () => {
    const s = makeStore([
      { time: 3, value: 30 },
      { time: 1, value: 10 },
      { time: 2, value: 20 },
    ]);
    expect(s.getAll().map((p) => p.time)).toEqual([1, 2, 3]);
  });

  it('first/last return correct points', () => {
    const s = makeStore([
      { time: 10, value: 1 },
      { time: 20, value: 2 },
      { time: 30, value: 3 },
    ]);
    expect(s.first()?.time).toBe(10);
    expect(s.last()?.time).toBe(30);
  });

  it('append adds to end', () => {
    const s = makeStore([{ time: 1, value: 10 }]);
    s.append({ time: 2, value: 20 });
    expect(s.length).toBe(2);
    expect(s.last()?.value).toBe(20);
  });

  it('append with same time updates last', () => {
    const s = makeStore([{ time: 1, value: 10 }]);
    s.append({ time: 1, value: 99 });
    expect(s.length).toBe(1);
    expect(s.last()?.value).toBe(99);
  });

  it('updateLast replaces last point', () => {
    const s = makeStore([
      { time: 1, value: 10 },
      { time: 2, value: 20 },
    ]);
    s.updateLast({ time: 2, value: 99 });
    expect(s.length).toBe(2);
    expect(s.last()?.value).toBe(99);
  });

  it('getVisibleData returns points in range', () => {
    const points = Array.from({ length: 100 }, (_, i) => ({ time: i * 60, value: i }));
    const s = makeStore(points);
    const visible = s.getVisibleData(1800, 3600); // 30min to 60min
    expect(visible.length).toBeGreaterThan(0);
    // all returned points should be near the range
    for (const p of visible) {
      expect(p.time).toBeGreaterThanOrEqual(1740); // allow -1 bar tolerance
      expect(p.time).toBeLessThanOrEqual(3660);
    }
  });

  it('getVisibleData returns empty for empty store', () => {
    const s = makeStore();
    expect(s.getVisibleData(0, 100)).toEqual([]);
  });

  it('emits update on setData', () => {
    const s = makeStore();
    let called = false;
    s.on('update', () => {
      called = true;
    });
    s.setData([{ time: 1, value: 1 }]);
    expect(called).toBe(true);
  });

  it('emits update on append', () => {
    const s = makeStore([{ time: 1, value: 1 }]);
    let called = false;
    s.on('update', () => {
      called = true;
    });
    s.append({ time: 2, value: 2 });
    expect(called).toBe(true);
  });
});
