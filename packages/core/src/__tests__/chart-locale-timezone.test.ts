import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChartInstance } from '../chart';

const HOUR = 3_600_000;

function makeChart(options?: ConstructorParameters<typeof ChartInstance>[1]): {
  chart: ChartInstance;
  container: HTMLElement;
} {
  const container = document.createElement('div');
  const width = 800;
  const height = 400;
  Object.defineProperty(container, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: height, configurable: true });
  container.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, bottom: height, right: width, width, height, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(container);

  return { chart: new ChartInstance(container, options), container };
}

describe('ChartInstance locale / timeZone', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  it('defaults to undefined (built-in en-US / local timezone)', () => {
    ({ chart, container } = makeChart());
    expect(chart.getLocale()).toBeUndefined();
    expect(chart.getTimeZone()).toBeUndefined();
  });

  it('ChartOptions.locale / timeZone flow through to timeScale at construction', () => {
    ({ chart, container } = makeChart({ locale: 'de-DE', timeZone: 'UTC' }));
    expect(chart.getLocale()).toBe('de-DE');
    expect(chart.getTimeZone()).toBe('UTC');

    const ts = Date.UTC(2018, 5, 15);
    expect(chart.timeScale.formatX(ts, 86_400_000)).toMatch(/Juni/);
  });

  it('setLocale / setTimeZone update live and are reflected in formatX', () => {
    ({ chart, container } = makeChart());
    chart.setTimeZone('UTC');
    const before = chart.timeScale.formatX(Date.UTC(2018, 5, 15, 0, 30), HOUR);

    chart.setLocale('de-DE');
    chart.setTimeZone('Asia/Tokyo');
    expect(chart.getLocale()).toBe('de-DE');
    expect(chart.getTimeZone()).toBe('Asia/Tokyo');

    const after = chart.timeScale.formatX(Date.UTC(2018, 5, 15, 0, 30), HOUR);
    expect(after).not.toBe(before);
  });
});
