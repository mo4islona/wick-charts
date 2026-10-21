// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance } from '../chart';
import type { ChartOptions } from '../chart/options';
import { CandlestickSeriesDef } from '../series/candlestick';
import { LineSeriesDef } from '../series/line';
import { installRaf, makeChartContainer } from './helpers/fake-raf';

const JUNE_2024_S = 1_717_200_000;
const DAY_S = 86_400;

function secondsMessages(warn: ReturnType<typeof vi.spyOn>): string[] {
  return warn.mock.calls.map((call) => String(call[0])).filter((message) => message.includes('Unix seconds'));
}

describe('ChartInstance with epoch-seconds times', () => {
  let raf: ReturnType<typeof installRaf>;
  let container: HTMLElement;
  let chart: ChartInstance;
  let warn: ReturnType<typeof vi.spyOn>;

  function makeChart(options: ChartOptions = {}): ChartInstance {
    container = makeChartContainer();
    chart = new ChartInstance(container, { animations: false, ...options });

    return chart;
  }

  beforeEach(() => {
    raf = installRaf();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    chart?.destroy();
    container?.remove();
    raf.uninstall();
    vi.restoreAllMocks();
  });

  it('warns once for a line fed seconds, on set and on stream', () => {
    makeChart();
    const id = chart.addSeries(LineSeriesDef);

    chart.setSeriesData(id, [
      { time: JUNE_2024_S, value: 1 },
      { time: JUNE_2024_S + DAY_S, value: 2 },
    ]);
    chart.appendData(id, { time: JUNE_2024_S + 2 * DAY_S, value: 3 });

    expect(secondsMessages(warn)).toHaveLength(1);
  });

  it('warns for candles fed seconds', () => {
    makeChart();
    const id = chart.addSeries(CandlestickSeriesDef);

    chart.setSeriesData(id, [{ time: JUNE_2024_S, open: 1, high: 2, low: 0.5, close: 1.5 }]);

    expect(secondsMessages(warn)).toHaveLength(1);
  });

  it('stays silent for ms times and for a numeric axis whose X spans the same numbers', () => {
    makeChart();
    const timeId = chart.addSeries(LineSeriesDef);
    chart.setSeriesData(timeId, [
      { time: JUNE_2024_S * 1000, value: 1 },
      { time: (JUNE_2024_S + DAY_S) * 1000, value: 2 },
    ]);
    chart.destroy();
    container.remove();

    makeChart({ axis: { x: { type: 'numeric' } } });
    const numericId = chart.addSeries(LineSeriesDef);
    chart.setSeriesData(numericId, [
      { x: 2e9, value: 1 },
      { x: 4e9, value: 2 },
    ]);

    expect(secondsMessages(warn)).toEqual([]);
  });
});
