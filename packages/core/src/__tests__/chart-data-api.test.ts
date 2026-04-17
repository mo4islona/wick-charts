import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChartInstance } from '../chart';

function makeChart(): { chart: ChartInstance; container: HTMLElement } {
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 600, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
  document.body.appendChild(container);
  return { chart: new ChartInstance(container, { interactive: false }), container };
}

describe('ChartInstance.setSeriesData — unified data API', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  it('sets data for a candlestick series', () => {
    const id = chart.addCandlestickSeries();
    const data = [
      { time: 1000, open: 10, high: 12, low: 8, close: 11 },
      { time: 2000, open: 11, high: 13, low: 10, close: 12 },
    ];
    chart.setSeriesData(id, data);
    expect(chart.getLastData(id)).toMatchObject({ time: 2000, close: 12 });
  });

  it('sets data for a single-layer line series', () => {
    const id = chart.addLineSeries();
    chart.setSeriesData(id, [
      { time: 1000, value: 10 },
      { time: 2000, value: 20 },
    ]);
    expect(chart.getLastData(id)).toMatchObject({ time: 2000, value: 20 });
  });

  it('sets data for a single-layer bar series', () => {
    const id = chart.addBarSeries();
    chart.setSeriesData(id, [
      { time: 1000, value: 5 },
      { time: 2000, value: 15 },
    ]);
    expect(chart.getLastData(id)).toMatchObject({ time: 2000, value: 15 });
  });

  it('writes to the right layer of a multi-layer line series', () => {
    const id = chart.addLineSeries({ layers: 3 });
    chart.setSeriesData(id, [{ time: 1, value: 100 }], 0);
    chart.setSeriesData(id, [{ time: 1, value: 200 }], 1);
    chart.setSeriesData(id, [{ time: 1, value: 300 }], 2);
    const snapshots = chart.getLayerSnapshots(id, 1);
    expect(snapshots).not.toBeNull();
    expect(snapshots!.map((s) => s.value)).toEqual([100, 200, 300]);
  });

  it('writes to the right layer of a multi-layer bar series', () => {
    const id = chart.addBarSeries({ layers: 2 });
    chart.setSeriesData(id, [{ time: 1, value: 1 }], 0);
    chart.setSeriesData(id, [{ time: 1, value: 2 }], 1);
    const snapshots = chart.getLayerSnapshots(id, 1);
    expect(snapshots).not.toBeNull();
    expect(snapshots!.map((s) => s.value)).toEqual([1, 2]);
  });

  it('sets data for a pie series', () => {
    const id = chart.addPieSeries();
    chart.setSeriesData(id, [
      { label: 'A', value: 10 },
      { label: 'B', value: 30 },
    ]);
    const slices = chart.getSliceInfo(id);
    expect(slices).not.toBeNull();
    expect(slices!.map((s) => s.label)).toEqual(['A', 'B']);
    expect(Math.round(slices![1].percent)).toBe(75);
  });

  it('setSeriesData for an invalid id is a no-op (does not throw)', () => {
    expect(() => chart.setSeriesData('does-not-exist', [{ time: 1, value: 1 }])).not.toThrow();
    expect(() => chart.setSeriesData('does-not-exist', [], 0)).not.toThrow();
  });

  it('appendData + updateData pass through to the renderer', () => {
    const id = chart.addLineSeries();
    chart.setSeriesData(id, [{ time: 1000, value: 10 }]);
    chart.appendData(id, { time: 2000, value: 20 });
    expect(chart.getLastData(id)).toMatchObject({ time: 2000, value: 20 });
    chart.updateData(id, { time: 2000, value: 25 });
    expect(chart.getLastData(id)).toMatchObject({ time: 2000, value: 25 });
  });

  it('setSeriesData normalizes Date time fields', () => {
    const id = chart.addLineSeries();
    const t = new Date(2024, 0, 1, 12, 0, 0);
    chart.setSeriesData(id, [{ time: t, value: 42 }]);
    const last = chart.getLastData(id) as { time: number; value: number };
    expect(typeof last.time).toBe('number');
    expect(last.time).toBe(t.getTime());
  });
});
