import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance } from '../chart';
import { type FakeRaf, installRaf } from './helpers/fake-raf';

const slices = [
  { label: 'Chrome', value: 65 },
  { label: 'Safari', value: 19 },
  { label: 'Edge', value: 16 },
];

function makeChart(): { chart: ChartInstance; container: HTMLElement } {
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 400, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 300, configurable: true });
  container.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, bottom: 300, right: 400, width: 400, height: 300, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(container);

  return { chart: new ChartInstance(container, { interactive: false }), container };
}

describe('ChartInstance.getPieHole', () => {
  let raf: FakeRaf;
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    raf = installRaf();
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
    raf.uninstall();
  });

  it('is null before the first render with data', () => {
    const id = chart.addSeries('pie', { innerRadiusRatio: 0.6 });

    expect(chart.getPieHole(id)).toBeNull();
  });

  it('gives the disk and hole that the render drew, in CSS pixels', () => {
    const id = chart.addSeries('pie', { innerRadiusRatio: 0.6, sliceLabels: { mode: 'none' } });
    chart.setSeriesData(id, slices);
    raf.flush(40);

    const hole = chart.getPieHole(id);
    expect(hole).not.toBeNull();
    if (!hole) return;

    expect(hole.x).toBeCloseTo(200, 0);
    expect(hole.y).toBeCloseTo(150, 0);
    expect(hole.outerRadius).toBeGreaterThan(0);
    expect(hole.outerRadius).toBeLessThanOrEqual(150);
    expect(hole.innerRadius).toBeCloseTo(hole.outerRadius * 0.6, 5);
  });

  it('has a zero inner radius for a pie without a hole', () => {
    const id = chart.addSeries('pie', { sliceLabels: { mode: 'none' } });
    chart.setSeriesData(id, slices);
    raf.flush(40);

    expect(chart.getPieHole(id)?.innerRadius).toBe(0);
  });

  it('is null for a series that is not a pie', () => {
    const id = chart.addSeries('line');
    chart.setSeriesData(id, [{ time: 1, value: 1 }]);
    raf.flush(40);

    expect(chart.getPieHole(id)).toBeNull();
  });

  it('emits overlayChange when the hole moves', () => {
    const id = chart.addSeries('pie', { innerRadiusRatio: 0.6, sliceLabels: { mode: 'none' } });
    chart.setSeriesData(id, slices);
    raf.flush(40);
    const before = chart.getPieHole(id);

    const listener = vi.fn();
    chart.on('overlayChange', listener);
    chart.setPadding({ top: 60 });
    raf.flush(40);

    const after = chart.getPieHole(id);
    expect(after?.y).not.toBe(before?.y);
    expect(listener).toHaveBeenCalled();
  });
});
