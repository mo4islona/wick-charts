// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance } from '../chart';
import { installRaf, makeChartContainer } from './helpers/fake-raf';

const CATEGORIES = ['a', 'b', 'c', 'd'];

function points(value: number) {
  return CATEGORIES.map((x, i) => ({ x, value: value * (i + 1) }));
}

describe('Y refit after a category data replace', () => {
  let raf: ReturnType<typeof installRaf>;
  let container: HTMLElement;
  let chart: ChartInstance;

  beforeEach(() => {
    raf = installRaf();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    chart?.destroy();
    container?.remove();
    raf.uninstall();
    vi.restoreAllMocks();
  });

  /** Y max after `points(1000)` drops to `points(10)` and one morph's worth of frames runs. */
  function maxAfterDrop(addSeries: (chart: ChartInstance) => string): number {
    container = makeChartContainer();
    chart = new ChartInstance(container, { axis: { x: { type: 'category' } } });
    const id = addSeries(chart);
    chart.setSeriesData(id, points(1000));
    raf.flush(200);

    chart.setSeriesData(id, points(10));
    const morphFrames = 20;
    for (let i = 0; i < morphFrames; i++) {
      raf.step();
    }

    return chart.yScale.getRange().max;
  }

  it('bar: a drastic drop contracts Y with the morph, not on the sticky hold', () => {
    expect(maxAfterDrop((c) => c.addSeries('bar', {}))).toBeLessThan(60);
  });

  it('line: a drastic drop contracts Y with the morph, not on the sticky hold', () => {
    expect(maxAfterDrop((c) => c.addSeries('line', {}))).toBeLessThan(60);
  });
});
