// No DOM here on purpose: a chart on a ChartSurface must run in plain Node.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance } from '../chart';
import { LineSeriesDef } from '../series/line';
import { createRecordingContext } from '../testing/recording-context';

const START = 1_700_000_000_000;
const MINUTE = 60_000;

function points(count: number): { time: number; value: number }[] {
  return Array.from({ length: count }, (_, i) => ({ time: START + i * MINUTE, value: 100 + Math.sin(i) * 5 }));
}

function headlessChart(): { chart: ChartInstance; spy: ReturnType<typeof createRecordingContext>['spy'] } {
  const { ctx, spy } = createRecordingContext();
  const chart = new ChartInstance(
    { width: 400, height: 200, pixelRatio: 2, context: ctx },
    { animations: false, interactive: false },
  );

  return { chart, spy };
}

describe('ChartInstance on a ChartSurface', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('runs with no DOM', () => {
    expect(typeof document).toBe('undefined');

    const { chart } = headlessChart();
    const id = chart.addSeries(LineSeriesDef, {});
    chart.setSeriesData(id, points(30));
    chart.flush();

    expect(chart.getMediaSize()).toEqual({ width: 400, height: 200 });
    expect(chart.describe().issues).toEqual([]);
    chart.destroy();
  });

  it('paints only on flush, never through requestAnimationFrame', () => {
    const raf = vi.fn();
    vi.stubGlobal('requestAnimationFrame', raf);

    const { chart, spy } = headlessChart();
    const id = chart.addSeries(LineSeriesDef, {});
    chart.setSeriesData(id, points(30));
    chart.appendData(id, { time: START + 30 * MINUTE, value: 101 });
    chart.setVisibleRange({ from: START + 20 * MINUTE, to: START + 30 * MINUTE });

    // The first data must not paint: an SVG target keeps every frame it gets.
    expect(spy.countOf('clearRect')).toBe(0);

    chart.flush();

    expect(raf).not.toHaveBeenCalled();
    expect(spy.countOf('clearRect')).toBe(1);
    expect(spy.countOf('stroke')).toBeGreaterThan(0);
    chart.destroy();
  });

  it('draws the series in device pixels of the surface', () => {
    const { chart, spy } = headlessChart();
    const id = chart.addSeries(LineSeriesDef, {});
    chart.setSeriesData(id, points(30));
    spy.reset();
    chart.flush();

    const clear = spy.callsOf('clearRect')[0];
    expect(clear?.args).toEqual([0, 0, 800, 400]);
    chart.destroy();
  });

  it('keeps the main layer under the overlay: one shared bitmap is cleared once a frame', () => {
    const { chart, spy } = headlessChart();
    const id = chart.addSeries(LineSeriesDef, {});
    chart.setSeriesData(id, points(30));
    chart.addLine({ value: 100, label: 'Level' });
    spy.reset();
    chart.flush();

    expect(spy.countOf('clearRect')).toBe(1);
    expect(spy.countOf('setLineDash')).toBeGreaterThan(0);
    chart.destroy();
  });
});
