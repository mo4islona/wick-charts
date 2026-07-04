import { LineSeries } from '@wick-charts/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

/**
 * Verifies ChartContainer's `onReady` / `onVisibleRangeChange` /
 * `onCrosshairMove` declarative props and the controlled `visibleRange` prop
 * — the imperative-only gap next to the already-covered `onPointClick` /
 * `onPointDoubleClick` / `onSeriesHover` (chart-container-point-click.test.tsx).
 */
describe('ChartContainer onReady / onVisibleRangeChange / onCrosshairMove / visibleRange', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  const lineData = [
    [
      { time: 1, value: 10 },
      { time: 2, value: 40 },
      { time: 3, value: 20 },
      { time: 4, value: 50 },
    ],
  ];

  it('fires onReady once at mount with the ChartInstance', () => {
    const onReady = vi.fn();
    mounted = mountChart(<LineSeries data={lineData} />, { onReady });

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady.mock.calls[0][0]).toBe(mounted.chart);
  });

  it('fires onCrosshairMove on hover, with null once the pointer leaves', () => {
    const onCrosshairMove = vi.fn();
    mounted = mountChart(<LineSeries data={lineData} />, { onCrosshairMove });

    mounted.dispatchMouse('mousemove', { clientX: 400, clientY: 200 }, mounted.overlayCanvas);
    expect(onCrosshairMove).toHaveBeenCalled();
    expect(onCrosshairMove.mock.calls.at(-1)?.[0]).not.toBeNull();

    mounted.dispatchMouse('mouseleave', {}, mounted.overlayCanvas);
    expect(onCrosshairMove.mock.calls.at(-1)?.[0]).toBeNull();
  });

  it('fires onVisibleRangeChange when the visible range changes imperatively', () => {
    const onVisibleRangeChange = vi.fn();
    mounted = mountChart(<LineSeries data={lineData} />, { onVisibleRangeChange });
    onVisibleRangeChange.mockClear();

    mounted.chart.setVisibleRange(2);
    mounted.flushScheduler();

    expect(onVisibleRangeChange).toHaveBeenCalled();
    const range = onVisibleRangeChange.mock.calls.at(-1)?.[0];
    expect(range).toEqual(mounted.chart.getVisibleRange());
  });

  it('applies a controlled visibleRange prop via chart.setVisibleRange', () => {
    mounted = mountChart(<LineSeries data={lineData} />, { visibleRange: { from: 1, to: 3 } });

    expect(mounted.chart.getVisibleRange()).toEqual({ from: 1, to: 3 });

    mounted.rerender(<LineSeries data={lineData} />, { visibleRange: { from: 2, to: 4 } });
    expect(mounted.chart.getVisibleRange()).toEqual({ from: 2, to: 4 });
  });

  it('does not re-apply a structurally-equal visibleRange literal on re-render', () => {
    mounted = mountChart(<LineSeries data={lineData} />, { visibleRange: { from: 1, to: 3 } });

    const spy = vi.spyOn(mounted.chart, 'setVisibleRange');
    // Fresh object literal every rerender, same values.
    mounted.rerender(<LineSeries data={lineData} />, { visibleRange: { from: 1, to: 3 } });

    expect(spy).not.toHaveBeenCalled();
  });

  it('picks up a fresh onReady/onVisibleRangeChange callback on re-render without a stable reference', () => {
    const firstRangeCb = vi.fn();
    const secondRangeCb = vi.fn();
    mounted = mountChart(<LineSeries data={lineData} />, { onVisibleRangeChange: firstRangeCb });

    mounted.rerender(<LineSeries data={lineData} />, { onVisibleRangeChange: secondRangeCb });
    mounted.chart.setVisibleRange(2);
    mounted.flushScheduler();

    expect(firstRangeCb).not.toHaveBeenCalled();
    expect(secondRangeCb).toHaveBeenCalled();
  });
});
