// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance, type ChartOptions } from '../chart';
import { buildHoverSnapshots, formatRowTime } from '../snapshots';
import { installRaf, makeChartContainer } from './helpers/fake-raf';

const DAY = 86_400_000;

function monthly(fromYear: number, toYear: number) {
  const points: { time: number; value: number }[] = [];
  for (let year = fromYear; year <= toYear; year++) {
    for (let month = 0; month < 12; month++) {
      points.push({ time: Date.UTC(year, month, 1), value: 4 + month / 10 });
    }
  }

  return points;
}

/** Monday to Friday only, as a market series. */
function businessDays(from: number, to: number) {
  const points: { time: number; value: number }[] = [];
  for (let time = from; time <= to; time += DAY) {
    const weekday = new Date(time).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;

    points.push({ time, value: 1 + ((time / DAY) % 7) });
  }

  return points;
}

describe('ChartInstance — a monthly and a daily series', () => {
  let raf: ReturnType<typeof installRaf>;
  let container: HTMLElement;
  let chart: ChartInstance;

  const makeChart = (options: ChartOptions = {}) => {
    chart = new ChartInstance(container, { interactive: false, ...options });
  };

  beforeEach(() => {
    raf = installRaf();
    container = makeChartContainer();
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
    raf.uninstall();
    vi.restoreAllMocks();
  });

  const seedLayers = () => {
    const id = chart.addSeries('line', { layers: 2 });
    chart.batch(() => {
      chart.setSeriesData(id, monthly(2019, 2021), 0);
      chart.setSeriesData(id, businessDays(Date.UTC(2019, 0, 1), Date.UTC(2021, 11, 31)), 1);
    });
    raf.flush();

    return id;
  };

  it('takes its data step from the finest series', () => {
    makeChart();
    seedLayers();

    expect(chart.getDataInterval()).toBe(DAY);
  });

  it('shows a 17-day range and zooms in to days', () => {
    makeChart();
    seedLayers();

    const from = Date.UTC(2020, 5, 25);
    const to = Date.UTC(2020, 6, 12);
    chart.setVisibleRange({ from, to });
    expect(chart.getVisibleRange()).toEqual({ from, to });

    for (let i = 0; i < 20; i++) chart.zoomAt(from + 8 * DAY, 0.5);
    const range = chart.getVisibleRange();
    expect(range.to - range.from).toBeLessThan(30 * DAY);
  });

  it('keeps the view and warns on a range narrower than two data steps', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    makeChart();
    seedLayers();
    const before = chart.getVisibleRange();

    chart.setVisibleRange({ from: Date.UTC(2020, 5, 25), to: Date.UTC(2020, 5, 25) + DAY });

    expect(chart.getVisibleRange()).toEqual(before);
    expect(warn.mock.calls.some(([message]) => String(message).includes('less than two data steps'))).toBe(true);
  });

  it('lists every layer next to the pointer, each at its own nearest point', () => {
    makeChart();
    const id = seedLayers();

    const time = Date.UTC(2020, 2, 20);
    const rows = buildHoverSnapshots(chart, { time, cacheKey: 'test' });
    const monthlyRow = rows.find((row) => row.id === `${id}_layer0`);
    const dailyRow = rows.find((row) => row.id === `${id}_layer1`);

    expect(dailyRow?.data.time).toBe(time);
    expect(monthlyRow?.data.time).toBe(Date.UTC(2020, 3, 1));

    // The header names Mar 20; the monthly row names its own date.
    const interval = chart.getDataInterval();
    const header = { time, snapshots: rows, interval };
    expect(dailyRow && formatRowTime(chart, { ...header, snapshot: dailyRow })).toBeNull();
    expect(monthlyRow && formatRowTime(chart, { ...header, snapshot: monthlyRow })).toMatch(/Apr/);
  });

  it('keeps a business-day row over a weekend', () => {
    makeChart();
    const id = seedLayers();

    // Saturday noon: a day and a half from Friday and from Monday.
    const rows = buildHoverSnapshots(chart, { time: Date.UTC(2020, 6, 4, 12), cacheKey: 'test' });

    expect(rows.some((row) => row.id === `${id}_layer1`)).toBe(true);
  });

  it('drops a layer the pointer is past by more than a step', () => {
    makeChart();
    const id = chart.addSeries('line', { layers: 2 });
    chart.batch(() => {
      chart.setSeriesData(id, businessDays(Date.UTC(2020, 0, 1), Date.UTC(2020, 11, 31)), 0);
      chart.setSeriesData(id, businessDays(Date.UTC(2020, 6, 1), Date.UTC(2020, 11, 31)), 1);
    });
    raf.flush();

    const rows = buildHoverSnapshots(chart, { time: Date.UTC(2020, 2, 10), cacheKey: 'test' });

    expect(rows.map((row) => row.id)).toEqual([`${id}_layer0`]);
  });

  it('gives each series its own decimals and one number style per Y scale', () => {
    makeChart({ scales: { price: { position: 'left' } } });
    const big = chart.addSeries('line');
    const small = chart.addSeries('line');
    const price = chart.addSeries('line', { scale: 'price' });
    chart.batch(() => {
      chart.setSeriesData(big, [{ time: DAY, value: 27_460_000 }]);
      chart.setSeriesData(small, [{ time: DAY, value: 2_434_010 }]);
      chart.setSeriesData(price, [{ time: DAY, value: 56_145.88 }]);
    });

    expect(chart.getValueStyle(big)).toEqual({ decimals: 0, compact: true });
    expect(chart.getValueStyle(small)).toEqual({ decimals: 0, compact: true });
    expect(chart.getValueStyle(price)).toEqual({ decimals: 2, compact: false });
  });
});

describe('ChartInstance — hover lookup on a category axis', () => {
  it('finds nothing in a band where the series has no point', () => {
    const raf = installRaf();
    const container = makeChartContainer();
    const chart = new ChartInstance(container, {
      interactive: false,
      axis: { x: { type: 'category', categories: ['Mon', 'Tue', 'Wed'] } },
    });
    const full = chart.addSeries('bar');
    const sparse = chart.addSeries('bar');
    chart.batch(() => {
      chart.setSeriesData(full, [
        { x: 'Mon', value: 1 },
        { x: 'Tue', value: 2 },
        { x: 'Wed', value: 3 },
      ]);
      chart.setSeriesData(sparse, [
        { x: 'Mon', value: 1 },
        { x: 'Wed', value: 3 },
      ]);
    });
    raf.flush();

    expect(chart.getDataAtTime(full, 1)).not.toBeNull();
    expect(chart.getDataAtTime(sparse, 1)).toBeNull();

    chart.destroy();
    container.remove();
    raf.uninstall();
  });
});
