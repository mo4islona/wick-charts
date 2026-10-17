import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { mountAxisLabels } from '../axis/dom-labels';
import { ChartInstance } from '../chart';
import { installRaf } from './helpers/fake-raf';

const INTERVAL = 60_000;
const START = 1_700_000_000_000;

function seedRect(el: HTMLElement, width: number, height: number): void {
  const rect: DOMRect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: height,
    right: width,
    width,
    height,
    toJSON: () => ({}),
  };
  el.getBoundingClientRect = () => rect;
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
}

interface Label {
  text: string;
  at: string;
}

// DOM order is creation order — a reused span stays ahead of new ones.
function byPosition(labels: Label[]): Label[] {
  return labels.sort((a, b) => Number.parseFloat(a.at) - Number.parseFloat(b.at));
}

function rendered(container: HTMLElement): Label[] {
  const labels = Array.from(container.children, (el) => {
    const span = el as HTMLElement;

    return { text: span.textContent ?? '', at: span.style.left || span.style.top };
  });

  return byPosition(labels);
}

function expectedX(chart: ChartInstance): Label[] {
  const { ticks, tickInterval } = chart.timeScale.niceTickValues(chart.getDataInterval());
  const labels = ticks.map((t) => ({
    text: chart.timeScale.formatX(t, tickInterval),
    at: `${chart.timeScale.timeToSnappedX(t)}px`,
  }));

  return byPosition(labels);
}

function expectedY(chart: ChartInstance): Label[] {
  const labels = chart.yScale.niceTickValues().map((v) => ({
    text: chart.yScale.formatY(v),
    at: `${chart.yScale.valueToSnappedY(v)}px`,
  }));

  return byPosition(labels);
}

describe('axis DOM labels with animations off', () => {
  let raf: ReturnType<typeof installRaf>;
  let chart: ChartInstance;
  let chartContainer: HTMLElement;
  let xLabels: HTMLElement;
  let yLabels: HTMLElement;
  const cleanups: Array<() => void> = [];

  beforeEach(() => {
    raf = installRaf();
    chartContainer = document.createElement('div');
    seedRect(chartContainer, 800, 400);
    document.body.appendChild(chartContainer);
    chart = new ChartInstance(chartContainer, { animations: false });
    const id = chart.addSeries('candlestick');
    chart.setSeriesData(
      id,
      Array.from({ length: 200 }, (_, i) => ({
        time: START + i * INTERVAL,
        open: 100 + i,
        high: 105 + i,
        low: 95 + i,
        close: 101 + i,
      })),
    );

    xLabels = document.createElement('div');
    yLabels = document.createElement('div');
    seedRect(xLabels, 800, 30);
    seedRect(yLabels, 55, 400);
    document.body.append(xLabels, yLabels);
    cleanups.push(mountAxisLabels({ chart, container: xLabels, axis: 'x' }));
    cleanups.push(mountAxisLabels({ chart, container: yLabels, axis: 'y' }));
    raf.flush(60);
  });

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
    chart.destroy();
    chartContainer.remove();
    xLabels.remove();
    yLabels.remove();
    raf.uninstall();
  });

  it('re-labels both axes after a zoom', () => {
    const before = rendered(yLabels);

    chart.zoomAt(START + 20 * INTERVAL, 0.1);
    raf.flush(60);

    expect(rendered(yLabels)).not.toEqual(before);
    expect(rendered(yLabels)).toEqual(expectedY(chart));
    expect(rendered(xLabels)).toEqual(expectedX(chart));
  });

  it('moves the axis labels after a pan', () => {
    chart.zoomAt(START + 100 * INTERVAL, 0.3);
    raf.flush(60);
    const before = rendered(xLabels);

    chart.pan(-30 * INTERVAL);
    raf.flush(60);

    expect(rendered(xLabels)).not.toEqual(before);
    expect(rendered(xLabels)).toEqual(expectedX(chart));
    expect(rendered(yLabels)).toEqual(expectedY(chart));
  });
});
