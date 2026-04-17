import { CandlestickSeries } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

/**
 * Integration test for the wheel → zoom → redraw path. Earlier layers cover
 * the arithmetic (`zoom-handler.test.ts`) and the viewport math
 * (`viewport.test.ts`). This file exercises the end-to-end contract that a
 * wheel event delivered to the overlay canvas actually (a) narrows the
 * visible range and (b) re-draws the chart on the next frame flush.
 */
describe('wheel zoom end-to-end', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  // Use the default 60s dataInterval so the viewport's "≥10 visible bars" clamp
  // doesn't cancel moderate zooms — 30 bars at 60s means newRange/dataInterval
  // stays well above 10 even after a sizable zoom-in.
  const data = Array.from({ length: 30 }, (_, i) => ({
    time: 1_000_000 + i * 60_000,
    open: 100 + i,
    high: 105 + i,
    low: 95 + i,
    close: 102 + i,
  }));

  it('negative deltaY narrows the visible range (zooms in)', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, { width: 800, height: 400 });
    const before = mounted.chart.getVisibleRange();
    const widthBefore = before.to - before.from;

    mounted.dispatchWheel({ deltaY: -200, clientX: 400, clientY: 200 }, mounted.overlayCanvas);
    mounted.flushScheduler();

    const after = mounted.chart.getVisibleRange();
    expect(after.to - after.from).toBeLessThan(widthBefore);
  });

  it('positive deltaY after a zoom-in widens the range back out', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, { width: 800, height: 400 });
    // First zoom in so the viewport is no longer at max span (the initial
    // fit-to-data state auto-scrolls and a further zoom-out is clamped).
    mounted.dispatchWheel({ deltaY: -200, clientX: 400, clientY: 200 }, mounted.overlayCanvas);
    mounted.flushScheduler();
    const zoomed = mounted.chart.getVisibleRange();
    const widthZoomed = zoomed.to - zoomed.from;

    // Now zoom out — width must strictly increase.
    mounted.dispatchWheel({ deltaY: 200, clientX: 400, clientY: 200 }, mounted.overlayCanvas);
    mounted.flushScheduler();

    const after = mounted.chart.getVisibleRange();
    expect(after.to - after.from).toBeGreaterThan(widthZoomed);
  });

  it('wheel triggers a redraw on the main canvas', () => {
    mounted = mountChart(<CandlestickSeries data={data} />, { width: 800, height: 400 });
    mounted.mainSpy.reset();
    expect(mounted.mainSpy.calls.length).toBe(0);

    mounted.dispatchWheel({ deltaY: -100, clientX: 400, clientY: 200 }, mounted.overlayCanvas);
    mounted.flushScheduler();

    // Any redraw emits at least one `clearRect` followed by series primitives.
    expect(mounted.mainSpy.countOf('clearRect')).toBeGreaterThanOrEqual(1);
    expect(mounted.mainSpy.countOf('fillRect')).toBeGreaterThan(0);
  });
});
