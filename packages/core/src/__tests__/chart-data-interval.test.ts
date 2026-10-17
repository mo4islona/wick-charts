import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChartInstance } from '../chart';
import { installRaf, makeChartContainer } from './helpers/fake-raf';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const T0 = 1_700_000_000_000;

function bars(count: number, opts: { start: number; step: number }) {
  return Array.from({ length: count }, (_, i) => ({ time: opts.start + i * opts.step, value: 50 + (i % 10) }));
}

describe('ChartInstance — data interval', () => {
  let raf: ReturnType<typeof installRaf>;
  let container: HTMLElement;
  let chart: ChartInstance;

  beforeEach(() => {
    raf = installRaf();
    container = makeChartContainer();
    chart = new ChartInstance(container, { interactive: false });
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
    raf.uninstall();
  });

  it('sizes bars for the finest step when the resolution changes part-way through', () => {
    const id = chart.addSeries('bar');
    const hourly = bars(24 * 30, { start: T0, step: HOUR });
    const switchAt = T0 + hourly.length * HOUR;

    chart.setSeriesData(id, [...hourly, ...bars(96, { start: switchAt, step: 15 * MINUTE })]);

    expect(chart.getDataInterval()).toBe(15 * MINUTE);
  });

  it('refines the step from the tail when a long series streams at a finer step', () => {
    const id = chart.addSeries('bar');
    const hourly = bars(3_000, { start: T0, step: HOUR });
    chart.setSeriesData(id, hourly);
    raf.flush();
    expect(chart.getDataInterval()).toBe(HOUR);

    const switchAt = T0 + hourly.length * HOUR;
    for (const point of bars(30, { start: switchAt, step: 15 * MINUTE })) {
      chart.appendData(id, point);
    }

    expect(chart.getDataInterval()).toBe(15 * MINUTE);
  });

  it('reads the tail from the layer it detected the step on', () => {
    const id = chart.addSeries('line', { layers: 2 });
    const twoDays = 2 * 24 * HOUR;
    chart.setSeriesData(id, bars(3_000, { start: T0, step: twoDays }), 1);
    raf.flush();

    chart.appendData(id, { time: T0 + 3_000 * twoDays, value: 50 }, 1);

    expect(chart.getDataInterval()).toBe(twoDays);
  });
});
