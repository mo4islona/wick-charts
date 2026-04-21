import { CandlestickSeries, LineSeries, YAxis } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

/**
 * Verifies that ChartContainer's top-level props flow through to the
 * ChartInstance: interactive wiring, grid draws, padding math, and axis
 * visibility collapsing the axis slot to 0px.
 */
describe('ChartContainer props', () => {
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

  it('interactive=false does not install InteractionHandler (no crosshair cursor)', () => {
    mounted = mountChart(<CandlestickSeries data={ohlc} />, { interactive: false });
    // InteractionHandler sets `cursor: crosshair` on the overlay canvas during
    // construction. When not installed, the canvas keeps its default cursor.
    expect(mounted.overlayCanvas.style.cursor).not.toBe('crosshair');
  });

  it('interactive=true (default) installs InteractionHandler (crosshair cursor)', () => {
    mounted = mountChart(<CandlestickSeries data={ohlc} />);
    expect(mounted.overlayCanvas.style.cursor).toBe('crosshair');
  });

  it('axis.y.visible=false collapses Y axis width to 0', () => {
    mounted = mountChart(<CandlestickSeries data={ohlc} />, { axis: { y: { visible: false } } });
    expect(mounted.chart.yAxisWidth).toBe(0);
  });

  it('axis.x.visible=false collapses X axis height to 0', () => {
    mounted = mountChart(<CandlestickSeries data={ohlc} />, { axis: { x: { visible: false } } });
    expect(mounted.chart.xAxisHeight).toBe(0);
  });

  it('custom axis.y.width overrides the default', () => {
    mounted = mountChart(<CandlestickSeries data={ohlc} />, { axis: { y: { width: 80 } } });
    expect(mounted.chart.yAxisWidth).toBe(80);
  });

  it('grid={{visible:false}} skips background grid draw calls', () => {
    const lineData: [Array<{ time: number; value: number }>] = [
      [
        { time: 1, value: 1 },
        { time: 2, value: 2 },
      ],
    ];
    // Baseline: grid={{visible:true}} draws grid lines (stroke calls with grid color).
    const withGrid = mountChart(
      <>
        <LineSeries data={lineData} />
        <YAxis />
      </>,
      { grid: { visible: true } },
    );
    const withGridStrokes = withGrid.mainSpy.countOf('stroke');
    withGrid.unmount();

    mounted = mountChart(
      <>
        <LineSeries data={lineData} />
        <YAxis />
      </>,
      { grid: { visible: false } },
    );
    const withoutGridStrokes = mounted.mainSpy.countOf('stroke');

    // grid.visible=false produces strictly fewer strokes (grid is the biggest stroke contributor).
    expect(withoutGridStrokes).toBeLessThan(withGridStrokes);
  });

  it('padding.top/bottom expand the Y-range so values clear the chart edges', () => {
    const lineData: [Array<{ time: number; value: number }>] = [
      [
        { time: 1, value: 0 },
        { time: 2, value: 100 },
      ],
    ];

    // Baseline: default top/bottom padding (20px each).
    const baseline = mountChart(<LineSeries data={lineData} />);
    const baselineRange = baseline.chart.getYRange();
    const baselineSpan = baselineRange.max - baselineRange.min;
    baseline.unmount();

    // More padding → more visual breathing room → wider yRange span covering the
    // same [0, 100] data because top/bottom pad into Y-value space.
    mounted = mountChart(<LineSeries data={lineData} />, { padding: { top: 80, bottom: 80 } });
    const paddedRange = mounted.chart.getYRange();
    const paddedSpan = paddedRange.max - paddedRange.min;

    expect(paddedSpan).toBeGreaterThan(baselineSpan);

    // Y-scale translates the widened Y-range into pixel space, so value=0 (the
    // data minimum) lands strictly inside the chart area rather than at the
    // absolute bottom pixel. Area-fill `lineTo` calls that trace the bottom
    // of the polygon don't count — `yScale.valueToY(min)` is the signal.
    const yMin = mounted.chart.yScale.valueToY(0);
    const chartBottom = mounted.mainCanvas.height;
    expect(yMin).toBeGreaterThan(0);
    expect(yMin).toBeLessThan(chartBottom);
  });
});
