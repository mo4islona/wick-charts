import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance } from '../chart';
import type { ChartOptions } from '../chart/options';
import { type FakeRaf, installRaf } from './helpers/fake-raf';

const MINUTE = 60_000;
const T0 = Date.UTC(2026, 0, 1);

function makeChart(args: { width?: number; height?: number; options?: ChartOptions } = {}) {
  const { width = 800, height = 400, options } = args;
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: height, configurable: true });
  container.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, bottom: height, right: width, width, height, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(container);

  return { chart: new ChartInstance(container, { interactive: false, ...options }), container };
}

function minutes(args: { from: number; count: number; value: (i: number) => number | null }) {
  const { from, count, value } = args;

  return Array.from({ length: count }, (_, i) => ({ time: T0 + (from + i) * MINUTE, value: value(i) }));
}

describe('ChartInstance.describe', () => {
  let raf: FakeRaf;
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    raf = installRaf();
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
    raf.uninstall();
  });

  it('describes a line chart with no issues', () => {
    ({ chart, container } = makeChart());
    const id = chart.addSeries('line', { label: 'BTC' });
    chart.setSeriesData(id, minutes({ from: 0, count: 60, value: (i) => 100 + i }));
    raf.flush(40);

    const description = chart.describe();

    expect(description.issues).toEqual([]);
    expect(description.x.type).toBe('time');
    expect(description.x.interval).toBe(MINUTE);
    expect(description.series).toHaveLength(1);
    expect(description.series[0]).toMatchObject({ id, kind: 'line', label: 'BTC', points: 60, last: { value: 159 } });
    expect(description.text).toContain('Chart: line, 800×400 px, time X axis.');
    expect(description.text).toContain('step 1m');
    expect(description.text).toContain(`${id} (line "BTC"): 60 points`);
    expect(description.text).toContain('last 159 at 2026-01-01T00:59Z');
    expect(description.text).toContain('Issues: none.');
  });

  it('reports a container with no height', () => {
    ({ chart, container } = makeChart({ height: 0 }));
    const id = chart.addSeries('line');
    chart.setSeriesData(id, minutes({ from: 0, count: 10, value: (i) => i }));
    raf.flush(40);

    const [first] = chart.describe().issues;

    expect(first?.code).toBe('no-size');
    expect(first?.severity).toBe('error');
    expect(first?.message).toMatch(/×0 px/);
  });

  it('reports a chart with no series and a series with no data', () => {
    ({ chart, container } = makeChart());
    expect(chart.describe().issues.map((issue) => issue.code)).toEqual(['no-series']);

    const id = chart.addSeries('line');
    const issues = chart.describe().issues;

    expect(issues).toEqual([expect.objectContaining({ code: 'no-data', severity: 'error', seriesId: id })]);
  });

  it('reports a series with no value in the visible range', () => {
    ({ chart, container } = makeChart());
    const early = chart.addSeries('line', { label: 'Early' });
    const late = chart.addSeries('line', { label: 'Late' });
    chart.setSeriesData(early, minutes({ from: 0, count: 30, value: (i) => i }));
    chart.setSeriesData(late, minutes({ from: 600, count: 30, value: (i) => i }));
    raf.flush(40);

    chart.setVisibleRange({ from: T0, to: T0 + 29 * MINUTE });
    raf.flush(40);

    const issues = chart.describe().issues;

    expect(issues).toEqual([expect.objectContaining({ code: 'out-of-view', severity: 'error', seriesId: late })]);
    expect(issues[0]?.message).toContain('Series "Late"');
    expect(issues[0]?.message).toContain('2026-01-01T10:00Z');
  });

  it('counts gaps in view and flags a flat series', () => {
    ({ chart, container } = makeChart());
    const id = chart.addSeries('line');
    chart.setSeriesData(id, minutes({ from: 0, count: 20, value: (i) => (i % 5 === 0 ? null : 42) }));
    raf.flush(40);

    const description = chart.describe();

    expect(description.series[0]?.gapsInView).toBe(4);
    expect(description.issues).toEqual([expect.objectContaining({ code: 'flat', severity: 'info' })]);
  });

  it('reports annotations outside the view', () => {
    ({ chart, container } = makeChart());
    const id = chart.addSeries('line');
    chart.setSeriesData(id, minutes({ from: 0, count: 60, value: (i) => 100 + i }));
    raf.flush(40);

    chart.addMarker({ time: T0 + 24 * 60 * MINUTE, label: 'Deploy' });
    chart.addLine({ value: 10_000, label: 'Target' });
    chart.addLine({ value: 120, label: 'Inside' });
    raf.flush(40);

    const description = chart.describe();
    const messages = description.issues.map((issue) => `${issue.severity} ${issue.message}`);

    expect(messages).toEqual([
      'warning Reference line "Target" at 10000 is outside the visible range, so it does not show.',
      'info Marker "Deploy" at 2026-01-02T00:00Z is outside the visible X range.',
    ]);
    expect(description.annotations).toEqual({ markers: 1, regions: 0, lines: 2 });
  });

  it('reads the low and high of candles in view', () => {
    ({ chart, container } = makeChart());
    const id = chart.addSeries('candlestick');
    const candles = Array.from({ length: 10 }, (_, i) => ({
      time: T0 + i * MINUTE,
      open: 10,
      high: 12 + i,
      low: 8 - i,
      close: 11,
    }));
    chart.setSeriesData(id, candles);
    raf.flush(40);

    const [series] = chart.describe().series;

    expect(series?.points).toBe(10);
    expect(series?.valuesInView).toEqual({ min: -1, max: 21 });
    expect(series?.last).toEqual({ x: T0 + 9 * MINUTE, value: 11 });
  });

  it('reads a line segment that crosses the view with no point inside it', () => {
    ({ chart, container } = makeChart());
    const line = chart.addSeries('line');
    const bar = chart.addSeries('bar');
    // Minutes 0–3 and 20–23, value = minute: one segment runs 3 → 20 across a view of 8–12.
    const data = [0, 1, 2, 3, 20, 21, 22, 23].map((m) => ({ time: T0 + m * MINUTE, value: m }));
    chart.setSeriesData(line, data);
    chart.setSeriesData(bar, data);
    raf.flush(40);

    chart.setVisibleRange({ from: T0 + 8 * MINUTE, to: T0 + 12 * MINUTE });
    raf.flush(40);

    const description = chart.describe();
    const lineDescription = description.series.find((s) => s.id === line);

    expect(lineDescription?.pointsInView).toBe(0);
    expect(lineDescription?.valuesInView).toEqual({ min: 8, max: 12 });
    // Bars do not join, so the bar series is the only one out of view.
    expect(description.issues).toEqual([expect.objectContaining({ code: 'out-of-view', seriesId: bar })]);
  });

  it('reports an empty pie, gauge and radar as series with no data', () => {
    ({ chart, container } = makeChart());
    const pie = chart.addSeries('pie');
    const gauge = chart.addSeries('gauge');
    const radar = chart.addSeries('radar');

    const noData = chart
      .describe()
      .issues.filter((issue) => issue.code === 'no-data')
      .map((issue) => issue.seriesId);

    expect(noData.sort()).toEqual([pie, gauge, radar].sort());
  });

  it('counts radar values as rows times axes', () => {
    ({ chart, container } = makeChart());
    const id = chart.addSeries('radar');
    chart.setSeriesData(id, {
      axes: ['Speed', 'Power', 'Range'],
      series: [
        { label: 'A', data: [1, 2, 3] },
        { label: 'B', data: [3, 2, 1] },
      ],
    });

    expect(chart.describe().series[0]?.points).toBe(6);
  });

  it('lists pie slices', () => {
    ({ chart, container } = makeChart());
    const id = chart.addSeries('pie', { label: 'Share' });
    chart.setSeriesData(id, [
      { label: 'BTC', value: 60 },
      { label: 'ETH', value: 40 },
    ]);
    raf.flush(40);

    const description = chart.describe();

    expect(description.y).toBeNull();
    expect(description.series[0]?.slices).toEqual([
      { label: 'BTC', value: 60, percent: 60 },
      { label: 'ETH', value: 40, percent: 40 },
    ]);
    expect(description.text).toContain('2 slices: BTC 60 (60%), ETH 40 (40%)');
  });

  it('names categories on a category axis', () => {
    ({ chart, container } = makeChart({ options: { axis: { x: { type: 'category' } } } }));
    const id = chart.addSeries('bar');
    chart.setSeriesData(id, [
      { x: 'Mon', value: 3 },
      { x: 'Tue', value: 5 },
      { x: 'Wed', value: 4 },
    ]);
    raf.flush(40);

    const { text } = chart.describe();

    expect(text).toContain('category X axis');
    expect(text).toMatch(/data Mon – Wed/);
  });
});

describe('ChartInstance.describe — data notes', () => {
  let raf: FakeRaf;
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    raf = installRaf();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
    raf.uninstall();
    vi.restoreAllMocks();
  });

  function dataIssues() {
    return chart
      .describe()
      .issues.filter((issue) => issue.code === 'data')
      .map(({ severity, topic, seriesId }) => ({ severity, topic, seriesId }));
  }

  it('notes sorted data, and drops the note when sorted data replaces it', () => {
    ({ chart, container } = makeChart());
    const id = chart.addSeries('line');
    const sorted = minutes({ from: 0, count: 10, value: (i) => i });

    chart.setSeriesData(id, [...sorted].reverse());
    expect(dataIssues()).toEqual([{ severity: 'info', topic: 'unsorted', seriesId: id }]);

    chart.setSeriesData(id, sorted);
    expect(dataIssues()).toEqual([]);

    // The console warns once per store; the note comes back every time.
    chart.setSeriesData(id, [...sorted].reverse());
    expect(dataIssues()).toEqual([{ severity: 'info', topic: 'unsorted', seriesId: id }]);
  });

  it('flags times in seconds as an error', () => {
    ({ chart, container } = makeChart());
    const id = chart.addSeries('line');
    const seconds = Array.from({ length: 10 }, (_, i) => ({ time: T0 / 1000 + i * 60, value: i }));

    chart.setSeriesData(id, seconds);

    const [issue] = chart.describe().issues;
    expect(issue).toMatchObject({ code: 'data', severity: 'error', topic: 'epoch-seconds', seriesId: id });
    expect(issue?.message).toContain('Unix seconds');
  });

  it('notes an append that is not after the last point', () => {
    ({ chart, container } = makeChart());
    const id = chart.addSeries('line');
    chart.setSeriesData(id, minutes({ from: 0, count: 10, value: (i) => i }));

    chart.appendData(id, { time: T0 + 3 * MINUTE, value: 99 });

    expect(dataIssues()).toEqual([{ severity: 'warning', topic: 'append-not-after-last', seriesId: id }]);
  });

  it('notes candles the renderer drops while it paints', () => {
    ({ chart, container } = makeChart());
    const id = chart.addSeries('candlestick');
    const candles = Array.from({ length: 10 }, (_, i) => ({
      time: T0 + i * MINUTE,
      open: 10,
      high: 12,
      low: 8,
      close: i === 4 ? Number.NaN : 11,
    }));

    chart.setSeriesData(id, candles);
    raf.flush(5);
    expect(dataIssues()).toEqual([{ severity: 'warning', topic: 'poisoned', seriesId: id }]);

    chart.setSeriesData(
      id,
      candles.map((candle) => ({ ...candle, close: 11 })),
    );
    raf.flush(5);
    expect(dataIssues()).toEqual([]);
  });

  it('notes points with no fitting x on a category axis', () => {
    ({ chart, container } = makeChart({ options: { axis: { x: { type: 'category' } } } }));
    const id = chart.addSeries('bar');

    chart.setSeriesData(id, [
      { x: 'Mon', value: 3 },
      { x: 2, value: 5 },
      { x: 'Wed', value: 4 },
    ]);

    const issue = chart.describe().issues.find((candidate) => candidate.topic === 'x-misfit');
    expect(issue?.message).toContain(
      "skipped 1 point(s) whose `x` is not a string, as the 'category' X axis needs (first: x = 2)",
    );
  });

  it('files each note on the series whose call made it', () => {
    ({ chart, container } = makeChart());
    const clean = chart.addSeries('pie');
    const dirty = chart.addSeries('pie');

    chart.setSeriesData(clean, [{ label: 'A', value: 1 }]);
    chart.setSeriesData(dirty, [
      { label: 'A', value: 1 },
      { label: 'B', value: -1 },
    ]);

    expect(dataIssues()).toEqual([{ severity: 'warning', topic: 'pie-undrawable', seriesId: dirty }]);
  });
});
