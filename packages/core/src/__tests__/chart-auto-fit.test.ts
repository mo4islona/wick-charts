/**
 * The window the chart picks for itself — the default fit and `initialRange` —
 * as more series load, data is set again, the stream fills the window, and
 * the user or the app takes over.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChartInstance, type ChartOptions } from '../chart';
import { installRaf, makeChartContainer } from './helpers/fake-raf';

const INTERVAL = 60_000;
const DAY = 86_400_000;
const T0 = 1_700_000_000_000;

function candles(count: number, opts: { start?: number; step?: number } = {}) {
  const { start = 0, step = INTERVAL } = opts;

  return Array.from({ length: count }, (_, i) => ({
    time: T0 + (start + i) * step,
    open: 100,
    high: 101 + (i % 7),
    low: 99 - (i % 5),
    close: 100.5,
  }));
}

function points(count: number) {
  return Array.from({ length: count }, (_, i) => ({ time: T0 + i * INTERVAL, value: 100 + (i % 9) }));
}

describe('ChartInstance — the chart’s own window', () => {
  let raf: ReturnType<typeof installRaf>;
  let container: HTMLElement;
  let chart: ChartInstance;

  function makeChart(options: Partial<ChartOptions> = {}): ChartInstance {
    chart = new ChartInstance(container, { interactive: false, ...options });

    return chart;
  }

  function visibleBars(step = INTERVAL): number {
    const range = chart.getVisibleRange();

    return (range.to - range.from) / step;
  }

  beforeEach(() => {
    raf = installRaf();
    container = makeChartContainer();
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
    raf.uninstall();
  });

  describe('initialRange holds until the user or the app moves the view', () => {
    it('keeps a bar count when a second series gets data', () => {
      makeChart({ viewport: { initialRange: 50 } });
      const candleId = chart.addSeries('candlestick');
      const lineId = chart.addSeries('line');

      chart.setSeriesData(candleId, candles(300));
      raf.flush();
      chart.setSeriesData(lineId, points(300));
      raf.flush();

      expect(visibleBars()).toBeGreaterThanOrEqual(50);
      expect(visibleBars()).toBeLessThan(55);
      expect(chart.getVisibleRange().to).toBeGreaterThanOrEqual(T0 + 299 * INTERVAL);
    });

    it('keeps a bar count when the same data is set again (StrictMode re-seed)', () => {
      makeChart({ viewport: { initialRange: 50 } });
      const id = chart.addSeries('candlestick');
      const data = candles(300);

      chart.setSeriesData(id, data);
      raf.flush();
      const first = { ...chart.getVisibleRange() };
      chart.setSeriesData(id, []);
      chart.setSeriesData(id, data);
      raf.flush();

      expect(chart.getVisibleRange()).toEqual(first);
    });

    it('keeps a warm-up window when the seed is set again', () => {
      const seed = candles(10);
      makeChart({ viewport: { initialRange: { from: seed[0].time, bars: 60 } } });
      const id = chart.addSeries('candlestick');

      chart.setSeriesData(id, seed);
      raf.flush();
      const first = { ...chart.getVisibleRange() };
      chart.setSeriesData(id, seed);
      raf.flush();

      expect(chart.getVisibleRange()).toEqual(first);
      expect(visibleBars()).toBe(60);
    });

    it('stops re-applying a window that streaming has moved', () => {
      const seed = candles(10);
      makeChart({ viewport: { initialRange: { from: seed[0].time, bars: 20 } } });
      const id = chart.addSeries('candlestick');
      chart.setSeriesData(id, seed);
      raf.flush();

      for (const candle of candles(30, { start: 10 })) {
        chart.appendData(id, candle);
        raf.flush(2);
      }
      chart.setSeriesData(id, candles(40));
      raf.flush();

      expect(chart.getVisibleRange().to).toBeGreaterThanOrEqual(T0 + 39 * INTERVAL);
    });

    it('falls back to the default fit when the window is narrower than two steps', () => {
      makeChart({ viewport: { initialRange: { from: T0, to: T0 + INTERVAL } } });
      const id = chart.addSeries('candlestick');

      chart.setSeriesData(id, candles(30));
      raf.flush();

      const range = chart.getVisibleRange();
      expect(range.from).toBeLessThanOrEqual(T0);
      expect(range.to).toBeGreaterThanOrEqual(T0 + 29 * INTERVAL);
    });

    it('lets a user zoom replace it', () => {
      makeChart({ viewport: { initialRange: 50 } });
      const id = chart.addSeries('candlestick');
      chart.setSeriesData(id, candles(300));
      raf.flush();

      chart.zoomAt(T0 + 280 * INTERVAL, 0.5);
      raf.flush();
      chart.setSeriesData(id, candles(300));
      raf.flush();

      expect(visibleBars()).not.toBeCloseTo(50, 0);
    });
  });

  describe('bar counts above maxVisibleBars', () => {
    it('shows an initialRange larger than the cap in full', () => {
      makeChart({ viewport: { initialRange: 730 } });
      const id = chart.addSeries('bar');
      chart.setSeriesData(
        id,
        Array.from({ length: 730 }, (_, i) => ({ time: T0 + i * DAY, value: i })),
      );
      raf.flush();

      expect(chart.getVisibleRange().from).toBeLessThanOrEqual(T0);
      expect(visibleBars(DAY)).toBeLessThan(740);
    });

    it('fitContent() fits every bar', () => {
      makeChart();
      const id = chart.addSeries('candlestick');
      chart.setSeriesData(id, candles(730, { step: DAY }));
      raf.flush();
      expect(visibleBars(DAY)).toBeLessThanOrEqual(200);

      chart.fitContent();
      raf.flush();

      const range = chart.getVisibleRange();
      expect(range.from).toBeLessThanOrEqual(T0);
      expect(range.to).toBeGreaterThanOrEqual(T0 + 729 * DAY);
    });

    it('caps the default fit at maxVisibleBars', () => {
      makeChart({ viewport: { maxVisibleBars: 100 } });
      const id = chart.addSeries('candlestick');
      chart.setSeriesData(id, candles(300));
      raf.flush();

      expect(visibleBars()).toBeCloseTo(100, 5);
    });
  });

  describe('a stream that starts with a few points', () => {
    function streamFrom(seed: number, appends: number): string {
      const id = chart.addSeries('candlestick');
      chart.setSeriesData(id, candles(seed));
      raf.flush();
      for (const candle of candles(appends, { start: seed })) {
        chart.appendData(id, candle);
        raf.flush(2);
      }
      raf.flush(60);

      return id;
    }

    it.each([0, 1, 2])('widens the window with the data from a seed of %i', (seed) => {
      makeChart();
      streamFrom(seed, 120);

      const range = chart.getVisibleRange();
      expect(range.from).toBeLessThanOrEqual(T0);
      expect(range.to).toBeGreaterThanOrEqual(T0 + (seed + 119) * INTERVAL);
    });

    it('holds the width at maxVisibleBars once the data fills it, then slides', () => {
      makeChart({ viewport: { maxVisibleBars: 60 } });
      streamFrom(2, 150);

      expect(visibleBars()).toBeCloseTo(60, 5);
      expect(chart.getVisibleRange().to).toBeGreaterThanOrEqual(T0 + 151 * INTERVAL);
    });

    it('widens an initialRange bar count until it holds that many bars', () => {
      makeChart({ viewport: { initialRange: 40 } });
      streamFrom(2, 100);

      expect(visibleBars()).toBeGreaterThanOrEqual(40);
      expect(visibleBars()).toBeLessThan(45);
      expect(chart.getVisibleRange().to).toBeGreaterThanOrEqual(T0 + 101 * INTERVAL);
    });

    it('stops widening after a user pan', () => {
      makeChart();
      const id = streamFrom(2, 10);
      chart.pan(-2 * INTERVAL);
      raf.flush(60);
      const panned = visibleBars();

      for (const candle of candles(20, { start: 12 })) {
        chart.appendData(id, candle);
        raf.flush(2);
      }

      expect(visibleBars()).toBeCloseTo(panned, 5);
    });
  });
});
