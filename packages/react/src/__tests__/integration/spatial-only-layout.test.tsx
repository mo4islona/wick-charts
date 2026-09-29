import { HeatmapSeries, LineSeries, PieSeries } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { CanvasRecorder, RecordedCall } from '../../../../core/src/testing/recording-context';
import { mountChart } from '../helpers/mount-chart';

/**
 * Pie and heatmap renderers lay out against the whole canvas, so a chart made
 * only of them reserves no axis gutters and gets no axis-column fade — the
 * auto ramp used to erase the right-most pie labels. Geometry at the default
 * 800×400 / dpr 1 mount.
 */
const pieSlices = [
  { label: 'alpha', value: 4 },
  { label: 'beta', value: 6 },
];

const heatmapCells = [
  { x: 'mon', y: 'api', value: 1 },
  { x: 'tue', y: 'api', value: 3 },
];

const lineData = [
  [
    { time: 1_000, value: 1 },
    { time: 2_000, value: 2 },
    { time: 3_000, value: 3 },
  ],
];

/** Every X / top mask erase — the masks are anchored at y = 0. */
function fadeRects(spy: CanvasRecorder): RecordedCall[] {
  return spy.callsOf('fillRect').filter((c) => c.globalCompositeOperation === 'destination-out' && c.args[1] === 0);
}

/** Width of the pane clip rects (the only `rect` calls spanning the pane height). */
function clipWidths(spy: CanvasRecorder, paneHeight: number): unknown[] {
  return spy
    .callsOf('rect')
    .filter((c) => c.args[3] === paneHeight)
    .map((c) => c.args[2]);
}

describe('spatial-only chart layout', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  it('pie-only chart reserves no axis gutters and applies no edge fade', () => {
    mounted = mountChart(<PieSeries data={pieSlices} />, { width: 800, height: 400 });

    expect(mounted.chart.yAxisWidth).toBe(0);
    expect(mounted.chart.xAxisHeight).toBe(0);
    expect(fadeRects(mounted.mainSpy)).toHaveLength(0);

    const widths = clipWidths(mounted.mainSpy, 400);
    expect(widths.length).toBeGreaterThan(0);
    expect(widths.every((w) => w === 800)).toBe(true);
  });

  it('heatmap-only chart reserves no axis gutters', () => {
    mounted = mountChart(<HeatmapSeries data={heatmapCells} />, { width: 800, height: 400 });

    expect(mounted.chart.yAxisWidth).toBe(0);
    expect(mounted.chart.xAxisHeight).toBe(0);
    expect(fadeRects(mounted.mainSpy)).toHaveLength(0);
  });

  it('an explicit fade width becomes a plain zone at that canvas edge', () => {
    mounted = mountChart(<PieSeries data={pieSlices} />, { width: 800, height: 400, fade: { right: 30, left: 20 } });

    const rects = fadeRects(mounted.mainSpy);
    const right = rects.filter((c) => c.args[0] === 770);
    const left = rects.filter((c) => c.args[0] === 0);
    expect(right[right.length - 1]?.args).toEqual([770, 0, 30, 400]);
    expect(left[left.length - 1]?.args).toEqual([0, 0, 20, 400]);
  });

  it('fade={false} keeps every mask off', () => {
    mounted = mountChart(<PieSeries data={pieSlices} />, { width: 800, height: 400, fade: false });

    expect(fadeRects(mounted.mainSpy)).toHaveLength(0);
  });

  it('an explicit axis size is still reserved, without the axis-column ramp', () => {
    mounted = mountChart(<PieSeries data={pieSlices} />, {
      width: 800,
      height: 400,
      axis: { y: { width: 55 }, x: { height: 30 } },
    });

    expect(mounted.chart.yAxisWidth).toBe(55);
    expect(mounted.chart.xAxisHeight).toBe(30);
    expect(fadeRects(mounted.mainSpy)).toHaveLength(0);
  });

  it('a chart with a time series keeps the gutters and the axis-column ramp', () => {
    mounted = mountChart(
      <>
        <PieSeries data={pieSlices} />
        <LineSeries data={lineData} />
      </>,
      { width: 800, height: 400 },
    );

    expect(mounted.chart.yAxisWidth).toBe(55);
    expect(mounted.chart.xAxisHeight).toBe(30);

    const rects = fadeRects(mounted.mainSpy);
    expect(rects[rects.length - 1]?.args).toEqual([697, 0, 60, 400]);
  });

  it('hiding every time series keeps the layout; removing them collapses it', () => {
    mounted = mountChart(
      <>
        <PieSeries data={pieSlices} />
        <LineSeries id="line" data={lineData} />
      </>,
      { width: 800, height: 400 },
    );

    mounted.chart.setSeriesVisible('line', false);
    mounted.flushScheduler();

    expect(mounted.chart.yAxisWidth).toBe(55);

    let viewportChanges = 0;
    mounted.chart.on('viewportChange', () => {
      viewportChanges++;
    });
    mounted.rerender(<PieSeries data={pieSlices} />);
    mounted.flushScheduler();

    expect(mounted.chart.yAxisWidth).toBe(0);
    expect(mounted.chart.xAxisHeight).toBe(0);
    expect(viewportChanges).toBeGreaterThan(0);
  });

  it('a time chart with every series hidden keeps its gutters', () => {
    mounted = mountChart(<LineSeries id="line" data={lineData} />, { width: 800, height: 400 });

    mounted.chart.setSeriesVisible('line', false);
    mounted.flushScheduler();

    expect(mounted.chart.yAxisWidth).toBe(55);
    expect(mounted.chart.xAxisHeight).toBe(30);
  });
});
