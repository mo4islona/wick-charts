// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mountAxisLabels } from '../axis/dom-labels';
import { ChartInstance } from '../chart';
import { installRaf, makeChartContainer } from './helpers/fake-raf';

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const DAY = 86_400_000;

describe('X axis tick labels', () => {
  let raf: ReturnType<typeof installRaf>;
  let container: HTMLElement;
  let chart: ChartInstance;
  let unmountLabels: (() => void) | null = null;

  beforeEach(() => {
    raf = installRaf();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    unmountLabels?.();
    unmountLabels = null;
    chart?.destroy();
    container?.remove();
    raf.uninstall();
    vi.restoreAllMocks();
  });

  function dailyChart(args: { width: number; from: number; to: number }): string[] {
    container = makeChartContainer(args.width, 400);
    chart = new ChartInstance(container, { animations: false, timeZone: 'UTC' });
    const id = chart.addSeries('line');
    const start = Date.UTC(2018, 0, 1);
    const days = (Date.UTC(2024, 0, 1) - start) / DAY;
    chart.setSeriesData(
      id,
      Array.from({ length: days }, (_, i) => ({ time: start + i * DAY, value: i % 50 })),
    );
    chart.setVisibleRange({ from: args.from, to: args.to });

    const strip = document.createElement('div');
    container.appendChild(strip);
    unmountLabels = mountAxisLabels({ chart, container: strip, axis: 'x' });
    raf.flush();

    return [...strip.querySelectorAll('span')].map((span) => span.textContent ?? '');
  }

  it('names the year on the January tick of quarterly labels', () => {
    const labels = dailyChart({ width: 1200, from: Date.UTC(2019, 0, 1), to: Date.UTC(2021, 5, 1) });

    expect(labels).toContain('Apr 1');
    expect(labels).toContain('2020');
    expect(labels).toContain('2021');
    expect(labels).not.toContain('Jan 1');
  });

  it('names the year on the January tick of monthly labels', () => {
    const labels = dailyChart({ width: 800, from: Date.UTC(2022, 5, 1), to: Date.UTC(2023, 2, 1) });

    expect(labels).toContain('Dec 1');
    expect(labels).toContain('2023');
    expect(labels).toContain('Feb 1');
    expect(labels).not.toContain('Jan 1');
  });

  it('keeps a few labels on a narrow window of 5-second candles', () => {
    // A 250px plot (55px Y axis) showing four minutes.
    container = makeChartContainer(305, 300);
    chart = new ChartInstance(container, { animations: false, timeZone: 'UTC' });
    const id = chart.addSeries('candlestick');
    const start = Date.UTC(2026, 9, 21, 2, 0);
    chart.setSeriesData(
      id,
      Array.from({ length: 120 }, (_, i) => ({ time: start + i * 5 * SECOND, open: 1, high: 2, low: 0.5, close: 1.5 })),
    );
    chart.setVisibleRange({ from: start + 2 * MINUTE, to: start + 6 * MINUTE });
    raf.flush();

    const { ticks, tickInterval } = chart.timeScale.niceTickValues(chart.getDataInterval());

    expect(tickInterval).toBeLessThanOrEqual(2 * MINUTE);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(ticks.length).toBeLessThanOrEqual(4);
  });
});
