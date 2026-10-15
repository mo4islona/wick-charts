import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChartInstance } from '../chart';
import { resolveYLabelSeriesId } from '../chart/badge-animator';
import { buildHoverSnapshots, buildLastSnapshots } from '../snapshots';

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

const OUTER = [
  { time: 1, low: 10, high: 90 },
  { time: 2, low: 15, high: 95 },
];
const INNER = [
  { time: 1, low: 40, high: 60 },
  { time: 2, low: 45, high: 65 },
];

describe('ChartInstance — band series', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  it('hover snapshots carry { time, low, high } per band layer', () => {
    const id = chart.addSeries('band', { layers: 2, labels: ['p5–p95', 'p25–p75'] });
    chart.setSeriesData(id, OUTER, 0);
    chart.setSeriesData(id, INNER, 1);

    const snaps = buildHoverSnapshots(chart, { time: 2, cacheKey: 'tooltip' });

    expect(snaps.map((s) => ({ label: s.label, data: s.data }))).toEqual([
      { label: 'p5–p95', data: { time: 2, low: 15, high: 95 } },
      { label: 'p25–p75', data: { time: 2, low: 45, high: 65 } },
    ]);
  });

  it('a single band reports its point through the last snapshots', () => {
    const id = chart.addSeries('band');
    chart.setSeriesData(id, OUTER);

    const [snap] = buildLastSnapshots(chart, { cacheKey: 'infobar' });

    expect(snap.data).toEqual({ time: 2, low: 15, high: 95 });
  });

  it('Y autoscale covers both edges', () => {
    const id = chart.addSeries('band');
    chart.setSeriesData(id, OUTER);

    const { min, max } = chart.getYRange();
    expect(min).toBeLessThanOrEqual(10);
    expect(max).toBeGreaterThanOrEqual(95);
  });

  it('a band has no last value to badge', () => {
    const id = chart.addSeries('band');
    chart.setSeriesData(id, OUTER);

    expect(chart.getLastValue(id)).toBeNull();
    expect(chart.getStackedValueAtTime(id, 2)).toBeNull();
  });

  it('the YLabel auto-pick skips bands for a valued series', () => {
    const band = chart.addSeries('band');
    chart.setSeriesData(band, OUTER);
    const line = chart.addSeries('line');
    chart.setSeriesData(line, [{ time: 2, value: 50 }]);

    expect(resolveYLabelSeriesId(chart, undefined)).toBe(line);
    expect(resolveYLabelSeriesId(chart, band)).toBe(band);

    chart.removeSeries(line);
    expect(resolveYLabelSeriesId(chart, undefined)).toBeNull();
  });
});
