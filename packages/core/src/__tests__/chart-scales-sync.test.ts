import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChartInstance } from '../chart';

/**
 * Scale-sync contracts — confirms that public reads of `chart.yScale` /
 * `chart.timeScale` always see coordinates consistent with the current
 * viewport + Y-range. This is the regression surface behind commit 7ac1a6b
 * (stale yScale after data swap) at the core level, without React.
 *
 * Named `chart-*` so `environmentMatchGlobs` hands this file a DOM
 * (ChartInstance instantiates canvases).
 */

function makeChart(): { chart: ChartInstance; container: HTMLElement } {
  const container = document.createElement('div');
  const width = 800;
  const height = 400;
  Object.defineProperty(container, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: height, configurable: true });
  // CanvasManager reads `container.getBoundingClientRect()` during init to
  // size the canvases. Happy-dom returns zero unless we stub it.
  container.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, bottom: height, right: width, width, height, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(container);
  return { chart: new ChartInstance(container, { interactive: false }), container };
}

describe('ChartInstance scale sync', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  it('yScale domain reflects the data range immediately after setSeriesData', () => {
    const id = chart.addLineSeries();
    chart.setSeriesData(id, [
      { time: 1, value: 10 },
      { time: 2, value: 20 },
      { time: 3, value: 100 },
    ]);

    const { min, max } = chart.yScale.getRange();
    // Padded Y-range must cover the data maximum — the bug was yScale lagging
    // by a frame and still reporting the stale (empty or narrower) domain.
    expect(max).toBeGreaterThanOrEqual(100);
    expect(min).toBeLessThanOrEqual(10);
  });

  it('yScale updates when data grows 10x (no stale domain)', () => {
    const id = chart.addLineSeries();
    chart.setSeriesData(id, [
      { time: 1, value: 1 },
      { time: 2, value: 10 },
    ]);
    const smallMax = chart.yScale.getRange().max;
    expect(smallMax).toBeLessThanOrEqual(12);

    chart.setSeriesData(id, [
      { time: 1, value: 100 },
      { time: 2, value: 1000 },
    ]);
    const bigMax = chart.yScale.getRange().max;
    expect(bigMax).toBeGreaterThanOrEqual(1000);
  });

  it('timeScale mapping updates when the viewport range changes via fitContent', () => {
    const id = chart.addLineSeries();
    chart.setSeriesData(id, [
      { time: 1000, value: 1 },
      { time: 2000, value: 2 },
      { time: 3000, value: 3 },
    ]);

    chart.fitContent();
    const range = chart.timeScale.getRange();
    expect(range.from).toBeLessThanOrEqual(1000);
    expect(range.to).toBeGreaterThanOrEqual(3000);

    // timeToX at the right edge should land near the media width (minus Y axis band).
    const xRight = chart.timeScale.timeToX(3000);
    expect(xRight).toBeGreaterThan(0);
    // 800px canvas - ~55px Y axis = ~745 media width. Accept any positive value
    // inside the chart area; the point is that the coordinate isn't zero
    // (which would happen if timeScale stayed at its initial empty range).
    expect(xRight).toBeLessThan(800);
  });

  it('batched data changes across multiple series land with a single consistent scale read', () => {
    const a = chart.addLineSeries();
    const b = chart.addLineSeries();

    chart.batch(() => {
      chart.setSeriesData(a, [
        { time: 1, value: 10 },
        { time: 2, value: 20 },
      ]);
      chart.setSeriesData(b, [
        { time: 1, value: 500 },
        { time: 2, value: 800 },
      ]);
    });

    // After the batch flushes, yScale must reflect the combined range (max >= 800),
    // not the intermediate state where only `a` was applied.
    const { max } = chart.yScale.getRange();
    expect(max).toBeGreaterThanOrEqual(800);
  });
});
