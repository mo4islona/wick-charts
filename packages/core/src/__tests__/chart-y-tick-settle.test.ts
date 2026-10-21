// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChartInstance } from '../chart';
import { installRaf, makeChartContainer } from './helpers/fake-raf';

describe('ChartInstance — Y ticks at rest', () => {
  let raf: ReturnType<typeof installRaf>;
  const charts: ChartInstance[] = [];
  const containers: HTMLElement[] = [];

  function makeChart(): ChartInstance {
    const container = makeChartContainer();
    const chart = new ChartInstance(container, { interactive: false });
    const id = chart.addSeries('line');
    chart.setSeriesData(id, [
      { time: 0, value: 1 },
      { time: 60_000, value: 2 },
    ]);
    raf.flush();
    containers.push(container);
    charts.push(chart);

    return chart;
  }

  beforeEach(() => {
    raf = installRaf();
  });

  afterEach(() => {
    for (const chart of charts.splice(0)) chart.destroy();
    for (const container of containers.splice(0)) container.remove();
    raf.uninstall();
  });

  it('gives a Y range the same ticks whether it was reached through a wider one or set at once', () => {
    const moved = makeChart();
    const gaps = Math.floor(moved.yScale.getMediaHeight() / 50);
    // Raw steps 5.4 then 4.92: the wider range picks a step of 10, the final one wants 5.
    moved.setAxis({ y: { min: 0, max: 5.4 * gaps } });
    raf.flush(120);
    moved.setAxis({ y: { min: 0, max: 4.92 * gaps } });
    raf.flush(120);

    const direct = makeChart();
    direct.setAxis({ y: { min: 0, max: 4.92 * gaps } });
    raf.flush(120);

    expect(moved.yScale.niceTickValues()).toEqual(direct.yScale.niceTickValues());
  });
});
