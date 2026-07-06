import { afterEach, describe, expect, it } from 'vitest';

import { LineSeries } from '../../index';
import { mountChart } from '../helpers/mount-chart';

/**
 * Controlled `visibleRange` regressions:
 *
 * 1. Date endpoints — `deepEqual` used to compare Dates as empty key bags,
 *    so any two Date-endpoint specs read as equal and a prop update was
 *    silently dropped.
 * 2. Chart rebuild — the applied-spec latch survived an `animations`-driven
 *    ChartInstance rebuild, so the fresh instance never received the
 *    still-set controlled range.
 */

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 0, 1);
const DATA = Array.from({ length: 100 }, (_, i) => ({ time: T0 + i * HOUR, value: 100 + (i % 7) }));

describe('controlled visibleRange', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;
  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  it('re-applies a Date-endpoint range when the prop moves to different dates', () => {
    mounted = mountChart(<LineSeries data={DATA} />, {
      visibleRange: { from: new Date(T0 + 10 * HOUR), to: new Date(T0 + 40 * HOUR) },
    });
    mounted.flushScheduler();
    expect(mounted.chart.getVisibleRange().from).toBeCloseTo(T0 + 10 * HOUR, -1);

    mounted.rerender(<LineSeries data={DATA} />, {
      visibleRange: { from: new Date(T0 + 50 * HOUR), to: new Date(T0 + 80 * HOUR) },
    });
    mounted.flushScheduler();

    expect(mounted.chart.getVisibleRange().from).toBeCloseTo(T0 + 50 * HOUR, -1);
    expect(mounted.chart.getVisibleRange().to).toBeCloseTo(T0 + 80 * HOUR, -1);
  });

  it('re-applies the unchanged range to a freshly rebuilt chart (animations change)', () => {
    const range = { from: T0 + 20 * HOUR, to: T0 + 60 * HOUR };
    const instances: import('@wick-charts/core').ChartInstance[] = [];
    mounted = mountChart(<LineSeries data={DATA} />, {
      visibleRange: range,
      animations: { series: { line: { entry: 100 } } },
      onReady: (chart) => instances.push(chart),
    });
    mounted.flushScheduler();
    expect(instances).toHaveLength(1);
    expect(instances[0].getVisibleRange().from).toBeCloseTo(range.from, -1);

    // A genuinely different animations value tears down and rebuilds the
    // ChartInstance; the controlled range prop itself does not change.
    mounted.rerender(<LineSeries data={DATA} />, {
      visibleRange: range,
      animations: { series: { line: { entry: 300 } } },
      onReady: (chart) => instances.push(chart),
    });
    mounted.flushScheduler();

    expect(instances).toHaveLength(2);
    expect(instances[1]).not.toBe(instances[0]);
    expect(instances[1].getVisibleRange().from).toBeCloseTo(range.from, -1);
    expect(instances[1].getVisibleRange().to).toBeCloseTo(range.to, -1);
  });
});
