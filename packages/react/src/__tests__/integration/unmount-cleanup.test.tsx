import { CandlestickSeries } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MockResizeObserver } from '../../../test-setup';
import { mountChart } from '../helpers/mount-chart';

/**
 * Regression safeguard for cleanup. mountChart's unmount() drains the
 * setTimeout(0) queue inside ChartContainer's effect cleanup so tests see
 * the fully-destroyed chart, not one that's only React-unmounted.
 * Contract locked in here:
 *   - CanvasManager.destroy() ran (canvases detached, ResizeObserver disconnected)
 *   - MockResizeObserver.callbacks shrinks back to baseline
 *   - Repeated mount/unmount cycles are steady-state (no listener accumulation)
 */
describe('mount/unmount cleanup', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  const data = [
    { time: 1, open: 10, high: 12, low: 9, close: 11 },
    { time: 2, open: 11, high: 13, low: 10, close: 12 },
  ];

  it('unmount disconnects the ResizeObserver: callbacks set returns to baseline', () => {
    const baseline = MockResizeObserver.callbacks.size;

    const m = mountChart(<CandlestickSeries data={data} />);
    expect(MockResizeObserver.callbacks.size).toBe(baseline + 1);

    m.unmount();

    // Destroy drained → resizeObserver.disconnect() ran → callback removed.
    expect(MockResizeObserver.callbacks.size).toBe(baseline);
  });

  it('repeated mount/unmount cycles keep the observer registry at baseline', () => {
    const baseline = MockResizeObserver.callbacks.size;

    for (let i = 0; i < 5; i++) {
      const m = mountChart(<CandlestickSeries data={data} />);
      m.unmount();
    }

    // No drift across cycles — every destroy disconnected cleanly.
    expect(MockResizeObserver.callbacks.size).toBe(baseline);
  });

  it('CanvasManager.destroy removes both canvases from the DOM', () => {
    mounted = mountChart(<CandlestickSeries data={data} />);
    const { mainCanvas, overlayCanvas, container } = mounted;

    expect(container.contains(mainCanvas)).toBe(true);
    expect(container.contains(overlayCanvas)).toBe(true);

    mounted.unmount();
    mounted = null;

    // destroy() calls `canvas.remove()` on both layers.
    expect(mainCanvas.parentElement).toBeNull();
    expect(overlayCanvas.parentElement).toBeNull();
  });

  it('after unmount ChartInstance has dropped all series', () => {
    mounted = mountChart(<CandlestickSeries data={data} id="a" />);
    expect(mounted.chart.getSeriesIds()).toHaveLength(1);

    const chart = mounted.chart;
    mounted.unmount();
    mounted = null;

    // removeSeries (sync useLayoutEffect cleanup) drops the series before
    // destroy runs — combined with the DOM-detach assertion above this
    // proves full teardown.
    expect(chart.getSeriesIds()).toHaveLength(0);
  });

  it('resize events after destroy do not hit the destroyed chart', () => {
    const baseline = MockResizeObserver.callbacks.size;

    const m = mountChart(<CandlestickSeries data={data} />);
    m.unmount();

    // Registry empty again — triggerResize would fan out to zero listeners.
    expect(MockResizeObserver.callbacks.size).toBe(baseline);

    // Fan-out is a no-op (nothing in the set), so no exception either.
    // This guards the case where a zombie chart would otherwise receive
    // synthetic resize events and crash.
    expect(() => {
      for (const cb of MockResizeObserver.callbacks) cb([], {} as ResizeObserver);
    }).not.toThrow();
  });
});
