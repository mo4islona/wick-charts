import { act } from '@testing-library/react';
import { HeatmapSeries, LineSeries, PieSeries } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

/**
 * Spatial-only charts (heatmap, pie) have no time axis, so the interaction
 * layer must not capture wheel/touch — hovering one while scrolling the page
 * used to trap the scroll. Time charts keep the capture (wheel = zoom).
 */
const heatmapCells = [
  { x: 'mon', y: 'api', value: 1 },
  { x: 'tue', y: 'api', value: 3 },
  { x: 'mon', y: 'web', value: 2 },
  { x: 'tue', y: 'web', value: 5 },
];

const pieSlices = [
  { label: 'alpha', value: 4 },
  { label: 'beta', value: 6 },
];

const lineData = [
  [
    { time: 1_000, value: 1 },
    { time: 2_000, value: 2 },
    { time: 3_000, value: 3 },
  ],
];

/** Dispatch a cancelable wheel and report whether the chart consumed it. */
function dispatchRawWheel(canvas: HTMLCanvasElement): WheelEvent {
  const event = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
  Object.defineProperty(event, 'offsetX', { value: 200, configurable: true });
  act(() => {
    canvas.dispatchEvent(event);
  });

  return event;
}

describe('spatial-only charts let the page scroll', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;
  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  it('heatmap-only chart passes the wheel through and keeps native touch scrolling', () => {
    mounted = mountChart(<HeatmapSeries data={heatmapCells} />);

    expect(mounted.chart.canPanZoom()).toBe(false);
    expect(mounted.overlayCanvas.style.touchAction).toBe('auto');

    const event = dispatchRawWheel(mounted.overlayCanvas);

    expect(event.defaultPrevented).toBe(false);
  });

  it('pie-only chart passes the wheel through the same way', () => {
    mounted = mountChart(<PieSeries data={pieSlices} />);

    expect(mounted.chart.canPanZoom()).toBe(false);
    expect(mounted.overlayCanvas.style.touchAction).toBe('auto');

    const event = dispatchRawWheel(mounted.overlayCanvas);

    expect(event.defaultPrevented).toBe(false);
  });

  it('time chart still captures the wheel for zoom', () => {
    mounted = mountChart(<LineSeries data={lineData} />);

    expect(mounted.chart.canPanZoom()).toBe(true);
    expect(mounted.overlayCanvas.style.touchAction).toBe('none');

    const event = dispatchRawWheel(mounted.overlayCanvas);

    expect(event.defaultPrevented).toBe(true);
  });

  it('hiding the only time series flips the chart to pass-through and back', () => {
    mounted = mountChart(
      <>
        <HeatmapSeries data={heatmapCells} />
        <LineSeries id="line" data={lineData} />
      </>,
    );

    expect(mounted.chart.canPanZoom()).toBe(true);
    expect(dispatchRawWheel(mounted.overlayCanvas).defaultPrevented).toBe(true);

    act(() => {
      mounted?.chart.setSeriesVisible('line', false);
    });
    mounted.flushScheduler();

    expect(mounted.chart.canPanZoom()).toBe(false);
    expect(mounted.overlayCanvas.style.touchAction).toBe('auto');
    expect(dispatchRawWheel(mounted.overlayCanvas).defaultPrevented).toBe(false);

    act(() => {
      mounted?.chart.setSeriesVisible('line', true);
    });
    mounted.flushScheduler();

    expect(mounted.chart.canPanZoom()).toBe(true);
    expect(mounted.overlayCanvas.style.touchAction).toBe('none');
  });
});
