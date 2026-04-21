import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChartInstance } from '../chart';

function makeChart(): { chart: ChartInstance; container: HTMLElement } {
  const container = document.createElement('div');
  const width = 800;
  const height = 400;
  Object.defineProperty(container, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: height, configurable: true });
  container.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, bottom: height, right: width, width, height, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(container);

  return { chart: new ChartInstance(container, { interactive: false }), container };
}

describe('ChartInstance.getSeriesType', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  it('returns "time" for line, bar and candlestick series', () => {
    const line = chart.addLineSeries();
    const bar = chart.addBarSeries();
    const candle = chart.addCandlestickSeries();
    expect(chart.getSeriesType(line)).toBe('time');
    expect(chart.getSeriesType(bar)).toBe('time');
    expect(chart.getSeriesType(candle)).toBe('time');
  });

  it('returns "pie" for pie series', () => {
    const pie = chart.addPieSeries();
    expect(chart.getSeriesType(pie)).toBe('pie');
  });

  it('returns null for unknown ids', () => {
    expect(chart.getSeriesType('nope')).toBeNull();
  });
});

describe('ChartInstance.getSeriesIdsByType', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  it('partitions series by renderer type', () => {
    const l = chart.addLineSeries();
    const p = chart.addPieSeries();
    const b = chart.addBarSeries();

    expect(chart.getSeriesIdsByType('time').sort()).toEqual([l, b].sort());
    expect(chart.getSeriesIdsByType('pie')).toEqual([p]);
  });

  it('visibleOnly excludes series with isSeriesVisible=false', () => {
    const shown = chart.addLineSeries();
    const hidden = chart.addLineSeries();
    chart.setSeriesVisible(hidden, false);

    expect(chart.getSeriesIdsByType('time', { visibleOnly: true })).toEqual([shown]);
    expect(chart.getSeriesIdsByType('time').sort()).toEqual([shown, hidden].sort());
  });

  it('visibleOnly excludes multi-layer series when every layer is hidden', () => {
    const id = chart.addLineSeries({ layers: 2 });
    chart.setSeriesData(id, [{ time: 1, value: 1 }], 0);
    chart.setSeriesData(id, [{ time: 1, value: 2 }], 1);

    // Both layers visible → included.
    expect(chart.getSeriesIdsByType('time', { visibleOnly: true })).toContain(id);

    chart.setLayerVisible(id, 0, false);
    // One layer still visible → included.
    expect(chart.getSeriesIdsByType('time', { visibleOnly: true })).toContain(id);

    chart.setLayerVisible(id, 1, false);
    // Every layer hidden → excluded.
    expect(chart.getSeriesIdsByType('time', { visibleOnly: true })).not.toContain(id);
  });

  it('singleLayerOnly excludes multi-layer series', () => {
    const single = chart.addLineSeries();
    const multi = chart.addLineSeries({ layers: 3 });

    const result = chart.getSeriesIdsByType('time', { singleLayerOnly: true });
    expect(result).toEqual([single]);
    expect(result).not.toContain(multi);
  });
});

describe('ChartInstance.getStackedLastValue', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  it('matches getLastValue for single-layer line series', () => {
    const id = chart.addLineSeries();
    chart.setSeriesData(id, [
      { time: 1, value: 10 },
      { time: 2, value: 42 },
    ]);
    expect(chart.getStackedLastValue(id)?.value).toBe(42);
    expect(chart.getStackedLastValue(id)?.value).toBe(chart.getLastValue(id)?.value);
  });

  it('returns cumulative stack top for stacked multi-layer line series', () => {
    const id = chart.addLineSeries({ layers: 2, stacking: 'normal' });
    chart.setSeriesData(id, [{ time: 1, value: 10 }], 0);
    chart.setSeriesData(id, [{ time: 1, value: 25 }], 1);
    expect(chart.getStackedLastValue(id)?.value).toBe(35);
  });

  it('returns cumulative stack top for stacked multi-layer bar series', () => {
    const id = chart.addBarSeries({ layers: 3, stacking: 'normal' });
    chart.setSeriesData(id, [{ time: 1, value: 5 }], 0);
    chart.setSeriesData(id, [{ time: 1, value: 7 }], 1);
    chart.setSeriesData(id, [{ time: 1, value: 3 }], 2);
    expect(chart.getStackedLastValue(id)?.value).toBe(15);
  });

  it('returns null for unknown ids', () => {
    expect(chart.getStackedLastValue('nope')).toBeNull();
  });

  it('normal-stacked bar with mixed-sign layers anchors to the positive top when positives exist', () => {
    // The previous implementation returned a naive net sum. For mixed-sign
    // values that collapses to a number that doesn't match
    // `renderStacked`'s geometry — positives and negatives stack
    // independently; the painted head sits on the side with contributions.
    const id = chart.addBarSeries({ layers: 3, stacking: 'normal' });
    chart.setSeriesData(id, [{ time: 1, value: 10 }], 0);
    chart.setSeriesData(id, [{ time: 1, value: -4 }], 1);
    chart.setSeriesData(id, [{ time: 1, value: 6 }], 2);

    // Positive top = 10 + 6 = 16, net sum = 12 (rejected).
    expect(chart.getStackedLastValue(id)?.value).toBe(16);
  });

  it('normal-stacked bar with all-negative layers anchors to the negative bottom', () => {
    const id = chart.addBarSeries({ layers: 2, stacking: 'normal' });
    chart.setSeriesData(id, [{ time: 1, value: -5 }], 0);
    chart.setSeriesData(id, [{ time: 1, value: -7 }], 1);
    expect(chart.getStackedLastValue(id)?.value).toBe(-12);
  });

  it('percent-stacked bar reports +100 / -100 / 0 based on the sign of contributions', () => {
    const positiveOnly = chart.addBarSeries({ layers: 2, stacking: 'percent' });
    chart.setSeriesData(positiveOnly, [{ time: 1, value: 3 }], 0);
    chart.setSeriesData(positiveOnly, [{ time: 1, value: 5 }], 1);
    expect(chart.getStackedLastValue(positiveOnly)?.value).toBe(100);

    const negativeOnly = chart.addBarSeries({ layers: 2, stacking: 'percent' });
    chart.setSeriesData(negativeOnly, [{ time: 1, value: -2 }], 0);
    chart.setSeriesData(negativeOnly, [{ time: 1, value: -8 }], 1);
    // Previously returned 0 for all-negative percent stacks.
    expect(chart.getStackedLastValue(negativeOnly)?.value).toBe(-100);

    const zero = chart.addBarSeries({ layers: 1, stacking: 'percent' });
    chart.setSeriesData(zero, [{ time: 1, value: 0 }], 0);
    // Single-layer path uses raw last value, which is 0 here.
    expect(chart.getStackedLastValue(zero)?.value).toBe(0);
  });

  it('normal-stacked line with mixed-sign layers anchors to the positive top', () => {
    const id = chart.addLineSeries({ layers: 2, stacking: 'normal' });
    chart.setSeriesData(id, [{ time: 1, value: 4 }], 0);
    chart.setSeriesData(id, [{ time: 1, value: -3 }], 1);
    expect(chart.getStackedLastValue(id)?.value).toBe(4);
  });
});

describe('ChartInstance.getLayerSnapshots (real layerIndex + sample time)', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  it('reports each entry with its owning layerIndex — not the filtered array index', () => {
    // Previously callers inferred layerIndex from the array position,
    // which silently shifted when hidden layers were filtered out.
    const id = chart.addLineSeries({ layers: 3 });
    chart.setSeriesData(id, [{ time: 10, value: 1 }], 0);
    chart.setSeriesData(id, [{ time: 10, value: 2 }], 1);
    chart.setSeriesData(id, [{ time: 10, value: 3 }], 2);
    chart.setLayerVisible(id, 1, false);

    const snaps = chart.getLayerSnapshots(id, 10);
    expect(snaps).toHaveLength(2);
    expect(snaps?.[0].layerIndex).toBe(0);
    expect(snaps?.[1].layerIndex).toBe(2);
  });

  it('reports the resolved sample time per layer, not the query time', () => {
    const id = chart.addLineSeries({ layers: 2 });
    chart.setSeriesData(
      id,
      [
        { time: 100, value: 1 },
        { time: 200, value: 2 },
      ],
      0,
    );
    chart.setSeriesData(
      id,
      [
        { time: 100, value: 10 },
        { time: 200, value: 20 },
      ],
      1,
    );

    // Query midway; both layers snap to t=200 (later point wins at ties).
    const snaps = chart.getLayerSnapshots(id, 150);
    expect(snaps?.[0].time).toBe(200);
    expect(snaps?.[1].time).toBe(200);
  });
});

describe('ChartInstance.getLayerLastSnapshots', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  it('returns null for single-layer series', () => {
    const id = chart.addLineSeries();
    chart.setSeriesData(id, [{ time: 1, value: 10 }]);
    expect(chart.getLayerLastSnapshots(id)).toBeNull();
  });

  it('returns per-layer last for ragged multi-layer line series — each layer at its own time', () => {
    const id = chart.addLineSeries({ layers: 2 });
    chart.setSeriesData(id, [{ time: 1, value: 10 }], 0);
    chart.setSeriesData(
      id,
      [
        { time: 1, value: 20 },
        { time: 5, value: 30 },
      ],
      1,
    );

    const snaps = chart.getLayerLastSnapshots(id);
    expect(snaps).not.toBeNull();
    expect(snaps).toHaveLength(2);
    expect(snaps?.[0]).toMatchObject({ layerIndex: 0, time: 1, value: 10 });
    expect(snaps?.[1]).toMatchObject({ layerIndex: 1, time: 5, value: 30 });
  });

  it('skips hidden layers', () => {
    const id = chart.addLineSeries({ layers: 2 });
    chart.setSeriesData(id, [{ time: 1, value: 10 }], 0);
    chart.setSeriesData(id, [{ time: 1, value: 20 }], 1);
    chart.setLayerVisible(id, 0, false);

    const snaps = chart.getLayerLastSnapshots(id);
    expect(snaps).toHaveLength(1);
    expect(snaps?.[0].layerIndex).toBe(1);
  });
});

describe('ChartInstance.getSeriesLabel', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  it('returns the label set on addLineSeries / addBarSeries / addCandlestickSeries / addPieSeries', () => {
    // Candlestick label used to be silently dropped by addCandlestickSeries;
    // fixed when that path was routed through the shared #registerSeries helper.
    const line = chart.addLineSeries({ label: 'Price' });
    const bar = chart.addBarSeries({ label: 'Volume' });
    const candle = chart.addCandlestickSeries({ label: 'BTC' });
    const pie = chart.addPieSeries({ label: 'Share' });

    expect(chart.getSeriesLabel(line)).toBe('Price');
    expect(chart.getSeriesLabel(bar)).toBe('Volume');
    expect(chart.getSeriesLabel(candle)).toBe('BTC');
    expect(chart.getSeriesLabel(pie)).toBe('Share');
  });

  it('returns undefined when no label was provided', () => {
    const id = chart.addCandlestickSeries();
    expect(chart.getSeriesLabel(id)).toBeUndefined();
  });
});
