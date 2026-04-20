import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChartInstance } from '../chart';

/**
 * Prior to the `<=` unification, `getDataAtTime` (single-layer) picked the
 * *later* point on a midpoint tie while `getLayerSnapshots` (multi-layer)
 * picked the *earlier* one. That mismatch caused single-layer and
 * multi-layer overlays to display different values at the exact cursor
 * midpoint. Both paths should now agree.
 */
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

describe('midpoint snap consistency', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  it('line: single-layer and multi-layer agree on the later point at a midpoint tie', () => {
    const single = chart.addLineSeries();
    chart.setSeriesData(single, [
      { time: 100, value: 1 },
      { time: 200, value: 2 },
    ]);

    const multi = chart.addLineSeries({ layers: 2 });
    chart.setSeriesData(
      multi,
      [
        { time: 100, value: 1 },
        { time: 200, value: 2 },
      ],
      0,
    );
    chart.setSeriesData(
      multi,
      [
        { time: 100, value: 10 },
        { time: 200, value: 20 },
      ],
      1,
    );

    const mid = 150;
    const singleResult = chart.getDataAtTime(single, mid);
    const multiLayers = chart.getLayerSnapshots(multi, mid);
    expect(singleResult).not.toBeNull();
    expect(multiLayers).not.toBeNull();

    // Both now prefer the later point at the tie.
    expect((singleResult as { value: number }).value).toBe(2);
    expect(multiLayers?.[0].value).toBe(2);
    expect(multiLayers?.[1].value).toBe(20);
  });

  it('bar: multi-layer agrees with single-layer at a midpoint tie', () => {
    const single = chart.addBarSeries();
    chart.setSeriesData(single, [
      { time: 100, value: 7 },
      { time: 200, value: 8 },
    ]);

    const multi = chart.addBarSeries({ layers: 2 });
    chart.setSeriesData(
      multi,
      [
        { time: 100, value: 7 },
        { time: 200, value: 8 },
      ],
      0,
    );
    chart.setSeriesData(
      multi,
      [
        { time: 100, value: 70 },
        { time: 200, value: 80 },
      ],
      1,
    );

    const mid = 150;
    const singleResult = chart.getDataAtTime(single, mid);
    const multiLayers = chart.getLayerSnapshots(multi, mid);
    expect((singleResult as { value: number }).value).toBe(8);
    expect(multiLayers?.[0].value).toBe(8);
    expect(multiLayers?.[1].value).toBe(80);
  });
});
