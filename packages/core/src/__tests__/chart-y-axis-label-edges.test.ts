// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mountAxisLabels } from '../axis/dom-labels';
import { ChartInstance } from '../chart';
import type { ChartOptions } from '../chart/options';
import { installRaf, makeChartContainer } from './helpers/fake-raf';

const LABEL_HEIGHT = 16;

describe('Y axis labels at the chart edges', () => {
  let raf: ReturnType<typeof installRaf>;
  let container: HTMLElement;
  let chart: ChartInstance;

  beforeEach(() => {
    raf = installRaf();
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(LABEL_HEIGHT);
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
    raf.uninstall();
    vi.restoreAllMocks();
  });

  /** Ticks land on both ends of the plot: 10 at the top edge, 0 on the floor. */
  function mountLabels(options: ChartOptions): { tops: Map<string, number>; unmount: () => void } {
    container = makeChartContainer();
    chart = new ChartInstance(container, { animations: false, ...options });
    chart.setSeriesData(
      chart.addSeries('line'),
      Array.from({ length: 11 }, (_, i) => ({ time: i * 1000, value: i })),
    );
    raf.flush(5);
    const column = document.createElement('div');
    container.appendChild(column);
    const unmount = mountAxisLabels({ chart, container: column, axis: 'y' });

    const tops = new Map<string, number>();
    for (const span of column.querySelectorAll('span')) {
      tops.set(span.textContent ?? '', Number.parseFloat(span.style.top));
    }

    return { tops, unmount };
  }

  it('shifts the top label down so the chart does not cut it', () => {
    const { tops, unmount } = mountLabels({ axis: { y: { min: 0, max: 10 } }, padding: { top: 0, bottom: 0 } });

    expect(chart.getYScale().valueToSnappedY(10)).toBeLessThan(LABEL_HEIGHT / 2);
    expect(tops.get('10')).toBe(LABEL_HEIGHT / 2);
    unmount();
  });

  it('keeps the floor label on its line, over the X axis row', () => {
    const { tops, unmount } = mountLabels({ axis: { y: { min: 0, max: 10 } }, padding: { top: 0, bottom: 0 } });

    expect(tops.get('0')).toBe(chart.getYScale().valueToSnappedY(0));
    unmount();
  });

  it('shifts the floor label up when there is no X axis row', () => {
    const { tops, unmount } = mountLabels({
      axis: { x: { visible: false }, y: { min: 0, max: 10 } },
      padding: { top: 0, bottom: 0 },
    });
    const plotHeight = chart.getYScale().getMediaHeight();

    expect(chart.xAxisHeight).toBe(0);
    expect(tops.get('0')).toBe(plotHeight - LABEL_HEIGHT / 2);
    unmount();
  });
});
