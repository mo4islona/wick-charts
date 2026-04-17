import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChartInstance } from '../chart';

function makeChart(): { chart: ChartInstance; container: HTMLElement } {
  const container = document.createElement('div');
  // Give it a nonzero size so interactions/canvases don't short-circuit.
  Object.defineProperty(container, 'clientWidth', { value: 600, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
  document.body.appendChild(container);
  return { chart: new ChartInstance(container, { interactive: false }), container };
}

describe('ChartInstance.batch', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  it('collapses multiple setSeriesData calls into a single dataUpdate event', () => {
    const id = chart.addLineSeries({ layers: 2 });
    let updates = 0;
    chart.on('dataUpdate', () => {
      updates++;
    });

    chart.batch(() => {
      chart.setSeriesData(id, [{ time: 1, value: 1 }], 0);
      chart.setSeriesData(id, [{ time: 1, value: 2 }], 1);
    });

    expect(updates).toBe(1);
  });

  it('collapses setSeriesVisible calls inside batch', () => {
    const id = chart.addLineSeries({ layers: 1 });
    chart.setSeriesData(id, [{ time: 1, value: 1 }]);

    // One dataUpdate from the initial setSeriesData.
    let updates = 0;
    chart.on('dataUpdate', () => {
      updates++;
    });

    // Visibility changes inside batch should NOT emit additional dataUpdate events.
    chart.batch(() => {
      chart.setSeriesVisible(id, false);
      chart.setSeriesVisible(id, true);
    });

    expect(updates).toBe(0);
  });

  it('throwing inside fn still flushes the batch (try/finally invariant)', () => {
    const id = chart.addLineSeries({ layers: 1 });
    let updates = 0;
    chart.on('dataUpdate', () => {
      updates++;
    });

    expect(() =>
      chart.batch(() => {
        chart.setSeriesData(id, [{ time: 1, value: 1 }]);
        throw new Error('boom');
      }),
    ).toThrow('boom');

    // The dataUpdate should still have fired despite the throw.
    expect(updates).toBe(1);

    // A second batch should behave normally — counter did not leak.
    chart.batch(() => {
      chart.setSeriesData(id, [{ time: 2, value: 2 }]);
    });
    expect(updates).toBe(2);
  });

  it('nested batches only flush at the outer boundary', () => {
    const id = chart.addLineSeries({ layers: 2 });
    let updates = 0;
    chart.on('dataUpdate', () => {
      updates++;
    });

    chart.batch(() => {
      chart.batch(() => {
        chart.setSeriesData(id, [{ time: 1, value: 1 }], 0);
      });
      // Still inside outer batch — no flush yet.
      expect(updates).toBe(0);
      chart.setSeriesData(id, [{ time: 1, value: 2 }], 1);
    });

    expect(updates).toBe(1);
  });
});
