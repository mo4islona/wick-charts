import { ChartInstance } from '@wick-charts/core';
import { CandlestickSeries } from '@wick-charts/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

/**
 * Regression: `animations` used to tear down + rebuild the whole chart on
 * every render whose caller passed a fresh inline object literal — even
 * when the resolved values were identical (the "most dangerous trap in the
 * API", per CUSTOMIZATION.md). A deep-equal latch now keeps the rebuild
 * effect's dependency stable across same-value literals; only a genuine
 * value change should still tear down and rebuild.
 */
describe('ChartContainer animations deep-diff (not teardown-per-render)', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
    vi.restoreAllMocks();
  });

  const ohlc = [
    { time: 1, open: 1, high: 2, low: 1, close: 2 },
    { time: 2, open: 2, high: 3, low: 2, close: 3 },
  ];

  it('does not rebuild the chart when a same-value animations literal is passed again', () => {
    const destroySpy = vi.spyOn(ChartInstance.prototype, 'destroy');
    mounted = mountChart(<CandlestickSeries data={ohlc} />, {
      animations: { axis: { y: { settle: 300 } } },
    });
    expect(destroySpy).not.toHaveBeenCalled();

    // A brand-new object literal, same values — must NOT trigger a rebuild.
    mounted.rerender(<CandlestickSeries data={ohlc} />, {
      animations: { axis: { y: { settle: 300 } } },
    });
    expect(destroySpy).not.toHaveBeenCalled();

    // Twice more, for good measure — this is exactly the "every render" case.
    mounted.rerender(<CandlestickSeries data={ohlc} />, {
      animations: { axis: { y: { settle: 300 } } },
    });
    mounted.rerender(<CandlestickSeries data={ohlc} />, {
      animations: { axis: { y: { settle: 300 } } },
    });
    expect(destroySpy).not.toHaveBeenCalled();
  });

  it('still rebuilds the chart when animations values genuinely change', () => {
    const destroySpy = vi.spyOn(ChartInstance.prototype, 'destroy');
    mounted = mountChart(<CandlestickSeries data={ohlc} />, {
      animations: { axis: { y: { settle: 300 } } },
    });
    expect(destroySpy).not.toHaveBeenCalled();

    mounted.rerender(<CandlestickSeries data={ohlc} />, {
      animations: { axis: { y: { settle: 600 } } },
    });
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });
});
