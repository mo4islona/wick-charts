import { BarSeries, LineSeries } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { CanvasRecorder } from '../../../../core/src/testing/recording-context';
import { mountChart } from '../helpers/mount-chart';

const BAR = '#46b78f';
const LINE = '#f0556a';

const points = (value: (i: number) => number) =>
  Array.from({ length: 30 }, (_, i) => ({ time: (i + 1) * 60_000, value: value(i) }));

const bars = { color: BAR, data: points((i) => (i % 5 === 0 ? 100 : 30)) };
const line = { color: LINE, data: points(() => 50) };

/** The series the last main frame painted, by color, in paint order. */
function lastFrameOrder(spy: CanvasRecorder): string[] {
  const order: string[] = [];
  for (const call of spy.calls) {
    const paints = call.method === 'fill' || call.method === 'fillRect' || call.method === 'stroke';
    if (!paints) continue;

    const color = call.method === 'stroke' ? call.strokeStyle : call.fillStyle;
    const series = color === BAR ? 'bar' : color === LINE ? 'line' : null;
    if (series !== null && order.at(-1) !== series) order.push(series);
  }

  // Every frame paints both series, so the last two runs are the last frame.
  return order.slice(-2);
}

describe('series draw order', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  it('paints a line declared after bars on top of them', () => {
    mounted = mountChart(
      <>
        <BarSeries id="bars" data={bars} />
        <LineSeries id="line" data={line} />
      </>,
    );
    mounted.flushScheduler();

    expect(mounted.chart.getSeriesIds()).toEqual(['bars', 'line']);
    expect(lastFrameOrder(mounted.mainSpy)).toEqual(['bar', 'line']);
  });

  it('paints bars declared after a line on top of it, on a secondary scale too', () => {
    mounted = mountChart(
      <>
        <LineSeries id="line" data={line} />
        <BarSeries id="bars" data={bars} scale="volume" />
      </>,
      { scales: { volume: { visible: false } } },
    );
    mounted.flushScheduler();

    expect(lastFrameOrder(mounted.mainSpy)).toEqual(['line', 'bar']);
  });
});
