// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance } from '../chart';
import type { ChartOptions } from '../chart/options';
import type { TimePoint } from '../types';
import { installRaf, makeChartContainer } from './helpers/fake-raf';

const INTERVAL = 60_000;
const START = 1_000_000;
// The recording canvas measures 6 px per character; a label keeps 8 px to the edge and 8 px to the plot.
const CHAR_PX = 6;
const LABEL_PADDING = 16;

function series(values: number[]): TimePoint[] {
  return values.map((value, i) => ({ time: START + i * INTERVAL, value }));
}

function columnFor(label: string): number {
  return label.length * CHAR_PX + LABEL_PADDING;
}

function box(args: { left: number; width: number }): DOMRect {
  const { left, width } = args;

  return { x: left, y: 0, left, top: 0, width, height: 20, right: left + width, bottom: 20, toJSON: () => ({}) };
}

describe('ChartInstance auto Y-axis width', () => {
  let raf: ReturnType<typeof installRaf>;
  let container: HTMLElement;
  let chart: ChartInstance;

  function makeChart(options: ChartOptions = {}): ChartInstance {
    container = makeChartContainer();
    chart = new ChartInstance(container, { interactive: false, animations: false, ...options });

    return chart;
  }

  /** The widest tick label the default axis shows now. */
  function widestLabel(): string {
    const labels = chart.yScale.niceTickValues().map((value) => chart.yScale.formatTick(value));

    return labels.reduce((widest, label) => (label.length > widest.length ? label : widest), '');
  }

  /** Move the fake clock forward by `ms`, one 16 ms frame at a time. */
  function advance(ms: number): void {
    for (let elapsed = 0; elapsed < ms; elapsed += 16) {
      raf.step();
    }
  }

  beforeEach(() => {
    raf = installRaf();
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
    raf.uninstall();
    vi.restoreAllMocks();
  });

  it('keeps the 55 px column until the first ticks exist', () => {
    makeChart();

    expect(chart.yAxisWidth).toBe(55);
  });

  it('fits the column to the widest tick label', () => {
    makeChart();
    const id = chart.addSeries('line');
    chart.setSeriesData(id, series([10, 40, 70, 100]));
    raf.flush();

    expect(widestLabel()).toBe('100');
    expect(chart.yAxisWidth).toBe(columnFor('100'));
    expect(chart.getLayout().chartArea.width).toBe(800 - columnFor('100'));
  });

  it('widens at once for a streamed point and keeps the width when the labels narrow', () => {
    makeChart();
    const id = chart.addSeries('line');
    chart.setSeriesData(id, series(Array.from({ length: 40 }, (_, i) => 10 + (i % 5))));
    raf.flush();
    const narrow = chart.yAxisWidth;

    chart.appendData(id, { time: START + 40 * INTERVAL, value: 25_000 });
    raf.flush();
    const wide = chart.yAxisWidth;
    expect(wide).toBeGreaterThan(narrow);
    expect(wide).toBe(columnFor(widestLabel()));

    // The view leaves the wide point: the labels narrow, the column holds.
    chart.setVisibleRange({ from: START, to: START + 20 * INTERVAL });
    raf.flush();
    expect(columnFor(widestLabel())).toBeLessThan(wide);
    expect(chart.yAxisWidth).toBe(wide);
  });

  it('narrows once the data is replaced', () => {
    makeChart();
    const id = chart.addSeries('line');
    chart.setSeriesData(id, series([1_000, 40_000, 70_000]));
    raf.flush();
    const wide = chart.yAxisWidth;

    chart.setSeriesData(id, series([1, 4, 7]));
    raf.flush();

    expect(chart.yAxisWidth).toBeLessThan(wide);
    expect(chart.yAxisWidth).toBe(columnFor(widestLabel()));
  });

  it('narrows when a new format shortens the labels', () => {
    makeChart();
    const id = chart.addSeries('line');
    chart.setSeriesData(id, series([10, 40, 70, 100]));
    raf.flush();

    chart.setYAxisFormat({ format: () => '1' });
    raf.flush();

    expect(chart.yAxisWidth).toBe(columnFor('1'));
  });

  it('keeps a fixed width', () => {
    makeChart({ axis: { y: { width: 70 } } });
    const id = chart.addSeries('line');
    chart.setSeriesData(id, series([10, 40, 70, 100]));
    raf.flush();

    expect(chart.yAxisWidth).toBe(70);
  });

  it('fits each named scale column to its own labels', () => {
    makeChart({ scales: { rsi: { position: 'left' } } });
    const price = chart.addSeries('line');
    const rsi = chart.addSeries('line', { scale: 'rsi' });
    chart.setSeriesData(price, series([10_000, 40_000, 70_000]));
    chart.setSeriesData(rsi, series([1, 4, 7]));
    raf.flush();

    const rsiScale = chart.getYScale('rsi');
    const rsiLabels = rsiScale.niceTickValues().map((value) => rsiScale.formatTick(value));
    const rsiWidest = Math.max(...rsiLabels.map((label) => label.length));

    expect(chart.getAxisColumnWidth('right')).toBe(columnFor(widestLabel()));
    expect(chart.getAxisColumnWidth('left')).toBe(rsiWidest * CHAR_PX + LABEL_PADDING);
    expect(chart.plotLeft).toBe(chart.getAxisColumnWidth('left'));
  });

  it('widens to hold a value badge registered with fitColumn, and narrows once it leaves', async () => {
    makeChart();
    const id = chart.addSeries('line');
    chart.setSeriesData(id, series([1, 4, 7]));
    raf.flush();
    const labelsOnly = chart.yAxisWidth;

    // A badge pinned 4 px from the right edge, 70 px wide: it reaches 74 px into the chart.
    const badge = document.createElement('div');
    container.appendChild(badge);
    badge.getBoundingClientRect = () => box({ left: 800 - 74, width: 70 });
    const cover = chart.coverAxisLabels(badge, { fitColumn: true });
    await Promise.resolve();
    raf.flush();

    expect(chart.yAxisWidth).toBe(74);

    cover.remove();
    await Promise.resolve();
    raf.flush();

    expect(chart.yAxisWidth).toBe(labelsOnly);
  });

  it('narrows after a data replace once the badge collapses its held digits', async () => {
    makeChart();
    const id = chart.addSeries('line');
    chart.setSeriesData(id, series([1, 4, 7]));
    raf.flush();

    let reach = 120;
    const badge = document.createElement('div');
    container.appendChild(badge);
    badge.getBoundingClientRect = () => box({ left: 800 - reach, width: reach - 4 });
    const cover = chart.coverAxisLabels(badge, { fitColumn: true });
    await Promise.resolve();
    raf.flush();
    expect(chart.yAxisWidth).toBe(120);

    // Y rests while the badge still holds the old digits' width.
    chart.setSeriesData(id, series([2, 5, 8]));
    raf.flush();
    expect(chart.yAxisWidth).toBe(120);

    // The badge collapses after its 1 s shrink delay.
    advance(1200);
    reach = 40;
    cover.update();
    await Promise.resolve();
    raf.flush();

    expect(chart.yAxisWidth).toBe(Math.max(columnFor(widestLabel()), 40));
  });

  it('keeps the width when a badge narrows without a shrink request', async () => {
    makeChart();
    const id = chart.addSeries('line');
    chart.setSeriesData(id, series([1, 4, 7]));
    raf.flush();

    let reach = 120;
    const badge = document.createElement('div');
    container.appendChild(badge);
    badge.getBoundingClientRect = () => box({ left: 800 - reach, width: reach - 4 });
    const cover = chart.coverAxisLabels(badge, { fitColumn: true });
    await Promise.resolve();
    raf.flush();

    advance(3000);
    reach = 40;
    cover.update();
    await Promise.resolve();
    raf.flush();

    expect(chart.yAxisWidth).toBe(120);
  });

  it('ignores a cover registered without fitColumn', async () => {
    makeChart();
    const id = chart.addSeries('line');
    chart.setSeriesData(id, series([1, 4, 7]));
    raf.flush();
    const labelsOnly = chart.yAxisWidth;

    const pill = document.createElement('div');
    container.appendChild(pill);
    pill.getBoundingClientRect = () => box({ left: 800 - 120, width: 120 });
    chart.coverAxisLabels(pill);
    await Promise.resolve();
    raf.flush();

    expect(chart.yAxisWidth).toBe(labelsOnly);
  });

  it('emits viewportChange when the column moves, so DOM axes re-read the layout', () => {
    makeChart();
    const id = chart.addSeries('line');
    const onViewport = vi.fn();
    chart.on('viewportChange', onViewport);

    chart.setSeriesData(id, series([10, 40, 70, 100]));
    raf.flush();

    expect(chart.yAxisWidth).not.toBe(55);
    expect(onViewport).toHaveBeenCalled();
  });
});
