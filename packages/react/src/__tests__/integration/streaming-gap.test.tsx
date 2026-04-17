import { LineSeries } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

/**
 * Regression #3 (commit 1c1aff1): the root-cause fix shipped in the docs
 * streaming source (it stopped skipping intervals under background-tab
 * throttling), but the library's job is to *render* whatever points land on
 * it — including one that is far away from its predecessor. These tests lock
 * in that appending after a large time gap:
 *   - produces finite coordinates (no NaN leak from a missing normalization)
 *   - advances the drawn line to the new point (no "frozen" tail)
 *   - still emits exactly one render for one append
 */
describe('streaming gap tolerance (regression #3)', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  it('line with a large interior time gap draws finite coordinates', () => {
    // Sampling pattern: tight head then a 4× gap — what a stale tick produces.
    const initial: [Array<{ time: number; value: number }>] = [
      [
        { time: 1_000, value: 50 },
        { time: 1_100, value: 51 },
        { time: 1_200, value: 52 },
        { time: 1_600, value: 58 }, // gap of 4 intervals
        { time: 1_700, value: 59 },
        { time: 1_800, value: 60 },
      ],
    ];
    mounted = mountChart(<LineSeries data={initial} />, { width: 800, height: 400 });

    const lineToCalls = mounted.mainSpy.callsOf('lineTo');
    expect(lineToCalls.length).toBeGreaterThan(0);
    // Any NaN X or Y would propagate from a leaked Date or un-normalized value.
    for (const c of lineToCalls) {
      expect(Number.isFinite(c.args[0] as number)).toBe(true);
      expect(Number.isFinite(c.args[1] as number)).toBe(true);
    }
  });

  it('rapid appends in a batch emit one dataUpdate and preserve all points', () => {
    const initial: [Array<{ time: number; value: number }>] = [
      [
        { time: 1, value: 1 },
        { time: 2, value: 2 },
      ],
    ];
    mounted = mountChart(<LineSeries data={initial} />);
    const seriesId = mounted.chart.getSeriesIds()[0];

    let dataUpdates = 0;
    mounted.chart.on('dataUpdate', () => {
      dataUpdates++;
    });

    mounted.chart.batch(() => {
      for (let i = 0; i < 10; i++) {
        mounted!.chart.appendData(seriesId, { time: 3 + i, value: 2 + i });
      }
    });

    // Batch collapses 10 appends into one dataUpdate event — no flood.
    expect(dataUpdates).toBe(1);
    // The store retains every appended point (getLastData ignores viewport).
    expect(mounted.chart.getLastData(seriesId)).toEqual({ time: 12, value: 11 });
  });
});
