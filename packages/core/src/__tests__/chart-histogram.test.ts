import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChartInstance } from '../chart';
import { syncHistogramLayers } from '../data/histogram-sync';
import { HistogramSeriesDef } from '../series/histogram';
import { buildHoverSnapshots, formatRowValue, formatTooltipHeader } from '../snapshots';
import { installRaf, makeChartContainer } from './helpers/fake-raf';

const STILL = { introMs: 0, entryMs: 0, smoothMs: 0 } as const;

describe('ChartInstance — histogram series', () => {
  let raf: ReturnType<typeof installRaf>;
  let container: HTMLElement;
  let chart: ChartInstance | null = null;

  beforeEach(() => {
    raf = installRaf();
    container = makeChartContainer();
  });

  afterEach(() => {
    chart?.destroy();
    chart = null;
    container.remove();
    raf.uninstall();
  });

  function numericChart(): ChartInstance {
    chart = new ChartInstance(container, { interactive: false, axis: { x: { type: 'numeric' } } });

    return chart;
  }

  it('fails fast on a time X axis', () => {
    chart = new ChartInstance(container, { interactive: false });
    const current = chart;

    expect(() => current.addSeries(HistogramSeriesDef, {})).toThrow(/'histogram' series can't plot on a 'time'/);
  });

  it('fits the bins with half a bin of air and puts the X ticks on bin edges', () => {
    const c = numericChart();
    const id = c.addSeries(HistogramSeriesDef, { ...STILL, binWidth: 20 });
    c.setSeriesData(id, [3, 25, 27, 61, 118]);
    raf.flush(30);

    expect(c.getVisibleRange()).toEqual({ from: -10, to: 130 });

    const { ticks, tickInterval } = c.timeScale.niceTickValues(c.getDataInterval());
    expect(tickInterval % 20).toBe(0);
    for (const tick of ticks) {
      expect(tick % 20).toBe(0);
    }
  });

  it('fits a single bin by its width, not the default data step', () => {
    const c = numericChart();
    const id = c.addSeries(HistogramSeriesDef, { ...STILL, binWidth: 20 });
    c.setSeriesData(id, [5, 6]);
    raf.flush(30);

    expect(c.getDataInterval()).toBe(20);
    expect(c.getVisibleRange()).toEqual({ from: -10, to: 30 });
  });

  it('names the bin range in the tooltip header and its count and share in the row', () => {
    const c = numericChart();
    const id = c.addSeries(HistogramSeriesDef, { ...STILL, binWidth: 20 });
    c.setSeriesData(id, [3, 25, 27, 61]);
    raf.flush(30);

    const snapshots = buildHoverSnapshots(c, { time: 30, cacheKey: 'test' });

    expect(formatTooltipHeader(c, { time: 30, snapshots, interval: c.getDataInterval() })).toBe('20 – 40');
    expect(formatRowValue(snapshots[0], String)).toBe('2 · 50%');
  });

  it('re-fits X when a streamed sample opens a bin past the left edge', () => {
    const c = numericChart();
    const id = c.addSeries(HistogramSeriesDef, { ...STILL, binWidth: 10 });
    c.setSeriesData(id, [15, 25, 35]);
    raf.flush(30);

    c.appendData(id, -42);
    raf.flush(120);

    expect(c.getVisibleRange().from).toBeLessThanOrEqual(-50);
    expect(c.getVisibleRange().to).toBeGreaterThanOrEqual(40);
  });

  it('zooms at the cursor, not at the right edge, and keeps the zoom while samples stream in', () => {
    const c = numericChart();
    const id = c.addSeries(HistogramSeriesDef, { ...STILL, binWidth: 10 });
    c.setSeriesData(
      id,
      Array.from({ length: 100 }, (_, i) => i),
    );
    raf.flush(30);

    const whole = c.getVisibleRange();
    c.zoomAt(20, 0.5);
    c.endGesture();
    raf.flush(60);
    const zoomed = c.getVisibleRange();

    const share = (range: { from: number; to: number }) => (20 - range.from) / (range.to - range.from);
    expect(share(zoomed)).toBeCloseTo(share(whole), 6);
    expect(zoomed.to).toBeLessThan(whole.to);

    c.appendData(id, 55);
    raf.flush(120);
    expect(c.getVisibleRange()).toEqual(zoomed);

    // Zoomed out to the whole data again, new samples re-fit the view.
    c.zoomAt(50, 10);
    c.endGesture();
    raf.flush(60);
    c.appendData(id, -42);
    raf.flush(120);
    expect(c.getVisibleRange().from).toBeLessThanOrEqual(-50);
  });

  it('snaps Y to the new units when normalize switches', () => {
    const c = numericChart();
    const id = c.addSeries(HistogramSeriesDef, { binWidth: 10 });
    c.setSeriesData(
      id,
      Array.from({ length: 400 }, (_, i) => i % 40),
    );
    raf.flush(120);
    expect(c.getYRange().max).toBeGreaterThan(40);

    c.updateSeriesOptions(id, { normalize: 'percent' });
    raf.flush(1);

    // 25% per bin: the axis lands on the percent range at once, not after an ease from the counts.
    expect(c.getYRange().max).toBeLessThan(40);
  });

  it('snaps Y to the new units of every overlaid layer at once', () => {
    const c = numericChart();
    const id = c.addSeries(HistogramSeriesDef, { binWidth: 10, layers: 2 });
    c.batch(() => {
      c.setSeriesData(
        id,
        Array.from({ length: 400 }, (_, i) => i % 40),
        0,
      );
      c.setSeriesData(
        id,
        Array.from({ length: 800 }, (_, i) => i % 40),
        1,
      );
    });
    raf.flush(120);

    c.updateSeriesOptions(id, { normalize: 'percent' });
    raf.flush(1);

    // Both layers put 25% in each bin; a fit to one layer still in counts would stay near 200.
    expect(c.getYRange().max).toBeLessThan(40);
  });

  it('names overlaid layers from the data for the legend and tooltip', () => {
    const c = numericChart();
    const id = c.addSeries(HistogramSeriesDef, { ...STILL, layers: 2 });
    syncHistogramLayers({
      chart: c,
      id,
      data: [
        { label: 'API', data: [10, 12, 14] },
        { label: 'DB', color: '#ff0000', data: [11, 30] },
      ],
      prev: [],
    });
    raf.flush(30);

    expect(c.getLayerLabel(id, 0)).toBe('API');
    expect(c.getLayerLabel(id, 1)).toBe('DB');
    expect(c.getSeriesLayers(id)?.[1].color).toBe('#ff0000');
  });
});
