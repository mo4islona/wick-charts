import { afterEach, describe, expect, it, vi } from 'vitest';

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
      { time: 3000, value: 30 },
      { time: 1000, value: 10 },
      { time: 2000, value: 20 },
    ]);
    expect(s.getAll().map((p) => p.time)).toEqual([1000, 2000, 3000]);
  });

  it('first/last return correct points', () => {
    const s = makeStore([
      { time: 10_000, value: 1 },
      { time: 20_000, value: 2 },
      { time: 30_000, value: 3 },
    ]);
    expect(s.first()?.time).toBe(10_000);
    expect(s.last()?.time).toBe(30_000);
  });

  it('append adds to end', () => {
    const s = makeStore([{ time: 1000, value: 10 }]);
    s.append({ time: 2000, value: 20 });
    expect(s.length).toBe(2);
    expect(s.last()?.value).toBe(20);
  });

  it('append with same time updates last', () => {
    const s = makeStore([{ time: 1000, value: 10 }]);
    s.append({ time: 1000, value: 99 });
    expect(s.length).toBe(1);
    expect(s.last()?.value).toBe(99);
  });

  it('updateLast replaces last point', () => {
    const s = makeStore([
      { time: 1000, value: 10 },
      { time: 2000, value: 20 },
    ]);
    s.updateLast({ time: 2000, value: 99 });
    expect(s.length).toBe(2);
    expect(s.last()?.value).toBe(99);
  });

  it('getVisibleData returns points in range', () => {
    const points = Array.from({ length: 100 }, (_, i) => ({ time: i * 60_000, value: i }));
    const s = makeStore(points);
    const visible = s.getVisibleData(1_800_000, 3_600_000); // 30min to 60min
    expect(visible.length).toBeGreaterThan(0);
    // all returned points should be near the range
    for (const p of visible) {
      expect(p.time).toBeGreaterThanOrEqual(1_740_000); // allow -1 bar tolerance
      expect(p.time).toBeLessThanOrEqual(3_660_000);
    }
  });

  it('getVisibleData returns empty for empty store', () => {
    const s = makeStore();
    expect(s.getVisibleData(0, 100_000)).toEqual([]);
  });

  describe('a rolling window', () => {
    const times = (points: readonly Point[]) => points.map((p) => p.time);
    const seed = () => makeStore([0, 1, 2, 3, 4].map((time) => ({ time, value: time })));

    it('draws a slid-out point while the view still reaches it', () => {
      const s = seed();
      s.getVisibleData(-0.5, 4.5);
      s.append({ time: 5, value: 5 });
      s.trimStart(1);

      expect(times(s.getVisibleData(0.5, 5.5))).toEqual([0, 1, 2, 3, 4, 5]);
      expect(times(s.getAll())).toEqual([1, 2, 3, 4, 5]);
      expect(s.first()?.time).toBe(1);
    });

    it('forgets the slid-out points once the view passes them', () => {
      const s = seed();
      s.getVisibleData(-0.5, 4.5);
      s.append({ time: 5, value: 5 });
      s.trimStart(1);
      s.getVisibleData(2.5, 7.5);
      s.append({ time: 6, value: 6 });
      s.trimStart(1);

      expect(times(s.getVisibleData(-10, 10))).toEqual([2, 3, 4, 5, 6]);
    });

    it('drops a one-off trim at once', () => {
      const s = seed();
      s.getVisibleData(-0.5, 4.5);
      s.trimStart(3);

      expect(times(s.getVisibleData(-0.5, 4.5))).toEqual([3, 4]);
    });

    it('keeps no slid-out point when nothing reads the view', () => {
      const s = seed();
      for (const time of [5, 6, 7]) {
        s.append({ time, value: time });
        s.trimStart(1);
      }

      expect(times(s.getVisibleData(-10, 10))).toEqual([3, 4, 5, 6, 7]);
    });
  });

  it('emits update on setData', () => {
    const s = makeStore();
    let called = false;
    s.on('update', () => {
      called = true;
    });
    s.setData([{ time: 1000, value: 1 }]);
    expect(called).toBe(true);
  });

  it('emits update on append', () => {
    const s = makeStore([{ time: 1000, value: 1 }]);
    let called = false;
    s.on('update', () => {
      called = true;
    });
    s.append({ time: 2000, value: 2 });
    expect(called).toBe(true);
  });

  describe('dev-only data warnings', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('warns once when setData receives unsorted timestamps', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const s = makeStore();

      s.setData([
        { time: 3000, value: 30 },
        { time: 1000, value: 10 },
      ]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('not sorted by time');

      // Every subsequent unsorted setData on the SAME instance stays silent.
      s.setData([
        { time: 3000, value: 30 },
        { time: 1000, value: 10 },
      ]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('does not warn when setData receives already-sorted timestamps', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const s = makeStore();

      s.setData([
        { time: 1000, value: 10 },
        { time: 2000, value: 20 },
      ]);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('warns once when append receives an out-of-order timestamp (downgraded to updateLast)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const s = makeStore([{ time: 2000, value: 10 }]);

      s.append({ time: 1000, value: 99 });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('treating it as an overwrite');

      // A second out-of-order append on the same instance stays silent.
      s.append({ time: 500, value: 1 });
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('does not warn when append receives a genuinely later timestamp', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const s = makeStore([{ time: 1000, value: 10 }]);

      s.append({ time: 2000, value: 20 });
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('epoch-seconds warning', () => {
    const DAY_S = 86_400;
    const JUNE_2024_S = 1_717_200_000;

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('warns once when the times are Unix seconds, showing where they land as ms', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const s = makeStore([
        { time: JUNE_2024_S, value: 1 },
        { time: JUNE_2024_S + DAY_S, value: 2 },
      ]);
      s.append({ time: JUNE_2024_S + 2 * DAY_S, value: 3 });
      s.setData([{ time: JUNE_2024_S, value: 1 }]);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const message = String(warnSpy.mock.calls[0][0]);
      expect(message).toContain('look like Unix seconds');
      expect(message).toContain('1970-01-20');
    });

    it('catches seconds that stream into an empty store and history from before 2001', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      makeStore().append({ time: JUNE_2024_S, value: 1 });
      makeStore([
        { time: 631_152_000, value: 1 }, // 1990-01-01 in seconds
        { time: JUNE_2024_S, value: 2 },
      ]);

      expect(warnSpy).toHaveBeenCalledTimes(2);
    });

    it('stays silent for ms times, pre-1970 times, small synthetic times and numeric-axis X', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      makeStore([
        { time: JUNE_2024_S * 1000, value: 1 },
        { time: (JUNE_2024_S + DAY_S) * 1000, value: 2 },
      ]);
      makeStore([
        { time: -JUNE_2024_S, value: 1 },
        { time: -DAY_S, value: 2 },
      ]);
      makeStore([
        { time: 0, value: 1 },
        { time: 5e8, value: 2 },
      ]);
      // A numeric axis copies `x` into `time`: a byte count is not a timestamp.
      const numeric = new TimeSeriesStore<Point & { x: number }>();
      numeric.setData([
        { time: 2e9, value: 1, x: 2e9 },
        { time: 4e9, value: 2, x: 4e9 },
      ]);

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('hasOnlyWholeValues', () => {
    const at = (time: number, value: number): Point => ({ time, value });

    it('is false while empty and true for whole values', () => {
      expect(makeStore().hasOnlyWholeValues()).toBe(false);
      expect(makeStore([at(1, 237), at(2, 120)]).hasOnlyWholeValues()).toBe(true);
    });

    it('follows appends and last-point updates', () => {
      const s = makeStore([at(1, 237), at(2, 120)]);
      s.append(at(3, 73.5));
      expect(s.hasOnlyWholeValues()).toBe(false);

      s.updateLast(at(3, 74));
      expect(s.hasOnlyWholeValues()).toBe(true);
    });

    it.each([
      'setData',
      'append',
      'prepend',
    ] as const)('tracks repeated in-place edits of a last point added with %s', (method) => {
      const point = at(2, 120.5);
      const s = makeStore();
      if (method === 'append') s.append(point);
      else s[method]([point]);

      point.value = 120;
      s.updateLast(point);
      expect(s.hasOnlyWholeValues()).toBe(true);

      point.value = 120.5;
      s.updateLast(point);
      expect(s.hasOnlyWholeValues()).toBe(false);

      point.value = 121;
      s.updateLast(point);
      expect(s.hasOnlyWholeValues()).toBe(true);
    });

    it('keeps the last-point fraction state when prepending or trimming other points', () => {
      const point = at(2, 120.5);
      const s = makeStore([point]);
      s.prepend([at(1, 237)]);
      s.trimStart(1);

      point.value = 120;
      s.updateLast(point);
      expect(s.hasOnlyWholeValues()).toBe(true);
    });

    it('turns true again once a trim drops the last fractional point', () => {
      const s = makeStore([at(1, 0.5), at(2, 120), at(3, 73)]);
      expect(s.hasOnlyWholeValues()).toBe(false);

      s.trimStart(1);
      expect(s.hasOnlyWholeValues()).toBe(true);
    });

    it('reads OHLC fields and ignores volume', () => {
      const s = new TimeSeriesStore<{
        time: number;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
      }>();
      s.setData([{ time: 1, open: 100, high: 110, low: 90, close: 105, volume: 1.25 }]);
      expect(s.hasOnlyWholeValues()).toBe(true);

      s.prepend([{ time: 0, open: 99.5, high: 101, low: 98, close: 100, volume: 2 }]);
      expect(s.hasOnlyWholeValues()).toBe(false);
    });
  });
});
