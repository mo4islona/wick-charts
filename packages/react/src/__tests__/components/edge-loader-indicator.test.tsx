import { act } from '@testing-library/react';
import type { LoadingIndicatorArgs, OHLCData } from '@wick-charts/core';
import { CandlestickSeries, ChartInstance, EdgeLoader } from '@wick-charts/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

/**
 * `EdgeLoader`'s `indicator` prop now accepts a `LoadingIndicatorFn` (in
 * addition to `'canvas'` / `'custom'`) — it registers/unregisters with
 * `chart.setEdgeIndicator` independently of the trigger state machine, so
 * swapping it never rebinds the viewport listener. Registration is latched
 * (`useLatestFn`): the core sees one stable wrapper for the whole time a
 * function is present, and the wrapper delegates to the latest render's fn.
 */

const INTERVAL = 60_000;
const FAKE_ARGS = {} as unknown as LoadingIndicatorArgs;

function makeBars(count: number): OHLCData[] {
  return Array.from({ length: count }, (_, i) => {
    const time = i * INTERVAL;
    const base = 100 + i;
    return { time, open: base, high: base + 1, low: base - 1, close: base + 0.5 };
  });
}

describe('EdgeLoader indicator prop', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
    vi.restoreAllMocks();
  });

  it('registers a wrapper that delegates to the function indicator, and unregisters on unmount', () => {
    const data = makeBars(20);
    const custom = vi.fn((_args: LoadingIndicatorArgs) => {});
    const setEdgeIndicator = vi.spyOn(ChartInstance.prototype, 'setEdgeIndicator');

    mounted = mountChart(
      <>
        <CandlestickSeries id="candle" data={data} />
        <EdgeLoader side="left" onTrigger={() => {}} indicator={custom} />
      </>,
    );

    expect(setEdgeIndicator).toHaveBeenCalledTimes(1);
    const [side, registered] = setEdgeIndicator.mock.calls[0];
    expect(side).toBe('left');

    registered?.(FAKE_ARGS);
    expect(custom).toHaveBeenCalledWith(FAKE_ARGS);

    mounted.unmount();
    expect(setEdgeIndicator).toHaveBeenLastCalledWith('left', null);
    mounted = null;
  });

  it('falls back to null (built-in dots) for the "canvas" and "custom" string modes', () => {
    const data = makeBars(20);
    const setEdgeIndicator = vi.spyOn(ChartInstance.prototype, 'setEdgeIndicator');

    mounted = mountChart(
      <>
        <CandlestickSeries id="candle" data={data} />
        <EdgeLoader side="left" onTrigger={() => {}} indicator="custom" />
      </>,
    );

    expect(setEdgeIndicator).toHaveBeenCalledWith('left', null);
  });

  it('swapping to a different function reference re-delegates without re-registering', () => {
    const data = makeBars(20);
    const first = vi.fn((_args: LoadingIndicatorArgs) => {});
    const second = vi.fn((_args: LoadingIndicatorArgs) => {});
    const setEdgeIndicator = vi.spyOn(ChartInstance.prototype, 'setEdgeIndicator');

    mounted = mountChart(
      <>
        <CandlestickSeries id="candle" data={data} />
        <EdgeLoader side="left" onTrigger={() => {}} indicator={first} />
      </>,
    );
    const registered = setEdgeIndicator.mock.calls[0][1];

    mounted.rerender(
      <>
        <CandlestickSeries id="candle" data={data} />
        <EdgeLoader side="left" onTrigger={() => {}} indicator={second} />
      </>,
    );

    // Same stable wrapper — the latch avoids a second registration call.
    expect(setEdgeIndicator).toHaveBeenCalledTimes(1);

    registered?.(FAKE_ARGS);
    expect(second).toHaveBeenCalledWith(FAKE_ARGS);
    expect(first).not.toHaveBeenCalled();
  });
});

describe('EdgeLoader minDuration', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
    vi.restoreAllMocks();
  });

  function panToHistoryEdge(chart: ChartInstance): void {
    act(() => chart.setVisibleRange(60));
    act(() => chart.pan(-200 * INTERVAL));
  }

  it('enters `loading` with a 400 ms hold by default', () => {
    const setEdgeState = vi.spyOn(ChartInstance.prototype, 'setEdgeState');
    mounted = mountChart(
      <>
        <CandlestickSeries id="candle" data={makeBars(200)} />
        <EdgeLoader side="left" onTrigger={() => new Promise(() => {})} />
      </>,
    );

    panToHistoryEdge(mounted.chart);

    expect(setEdgeState).toHaveBeenCalledWith('left', 'loading', { minDuration: 400 });
  });

  it('does not fire again while a resolved fetch is still inside its hold', async () => {
    const onTrigger = vi.fn(() => Promise.resolve());
    mounted = mountChart(
      <>
        <CandlestickSeries id="candle" data={makeBars(200)} />
        <EdgeLoader side="left" onTrigger={onTrigger} minDuration={10_000} />
      </>,
    );
    const { chart } = mounted;

    panToHistoryEdge(chart);
    await act(async () => {});
    act(() => chart.pan(-INTERVAL));

    expect(onTrigger).toHaveBeenCalledTimes(1);
    expect(chart.getEdgeState('left')).toBe('loading');
  });
});
