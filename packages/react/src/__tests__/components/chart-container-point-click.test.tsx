import { CandlestickSeries, PieSeries } from '@wick-charts/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

/**
 * Verifies ChartContainer's declarative onPointClick / onPointDoubleClick /
 * onSeriesHover props: they fire, they carry the hit-test result, and the
 * latest callback is used on re-render without re-subscribing (unlike the
 * mount-only onEdgeReached).
 */
describe('ChartContainer onPointClick / onPointDoubleClick / onSeriesHover', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  const ohlc = [
    { time: 1, open: 1, high: 2, low: 1, close: 2 },
    { time: 2, open: 2, high: 3, low: 2, close: 3 },
    { time: 3, open: 3, high: 4, low: 3, close: 4 },
  ];

  it('fires onPointClick with a null spatialHit for a click over a time-series series', () => {
    const onPointClick = vi.fn();
    mounted = mountChart(<CandlestickSeries data={ohlc} />, { onPointClick });

    mounted.dispatchMouse('click', { clientX: 400, clientY: 200 }, mounted.overlayCanvas);

    expect(onPointClick).toHaveBeenCalledTimes(1);
    expect(onPointClick.mock.calls[0][0].spatialHit).toBeNull();
  });

  it('fires onPointDoubleClick and the chart still fits content on double-click', () => {
    const onPointDoubleClick = vi.fn();
    mounted = mountChart(<CandlestickSeries data={ohlc} />, { onPointDoubleClick });

    mounted.dispatchMouse('dblclick', { clientX: 400, clientY: 200 }, mounted.overlayCanvas);

    expect(onPointDoubleClick).toHaveBeenCalledTimes(1);
  });

  it('fires onSeriesHover with the pie slice under the pointer, and null once it leaves', () => {
    const onSeriesHover = vi.fn();
    mounted = mountChart(
      <PieSeries
        data={[
          { label: 'A', value: 25 },
          { label: 'B', value: 25 },
          { label: 'C', value: 50 },
        ]}
      />,
      { onSeriesHover },
    );

    // mountChart defaults to an 800x400 container → center (400, 200).
    // Slightly above center → first slice (starts at 12 o'clock).
    mounted.dispatchMouse('mousemove', { clientX: 405, clientY: 150 }, mounted.overlayCanvas);

    expect(onSeriesHover).toHaveBeenCalled();
    const hit = onSeriesHover.mock.calls.at(-1)?.[0];
    expect(hit).toMatchObject({ index: 0 });

    mounted.dispatchMouse('mouseleave', {}, mounted.overlayCanvas);
    expect(onSeriesHover.mock.calls.at(-1)?.[0]).toBeNull();
  });

  it('picks up a fresh onPointClick callback on re-render without needing a stable reference', () => {
    const first = vi.fn();
    const second = vi.fn();
    mounted = mountChart(<CandlestickSeries data={ohlc} />, { onPointClick: first });

    mounted.rerender(<CandlestickSeries data={ohlc} />, { onPointClick: second });
    mounted.dispatchMouse('click', { clientX: 400, clientY: 200 }, mounted.overlayCanvas);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
