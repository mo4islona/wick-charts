import { CandlestickSeriesDef, ChartInstance, registerBuiltinSeries } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { installCanvasMock } from '../testing';

/**
 * `@wick-charts/react` is a documented vanilla entry point (README § "No
 * framework? Use the engine directly") — `ChartInstance` has no React
 * dependency, so it should work with zero React APIs touched: no render(),
 * no act(), no component tree. This is the regression guard for that claim.
 */
describe('vanilla usage via @wick-charts/react (no React APIs involved)', () => {
  let uninstall: (() => void) | null = null;

  afterEach(() => {
    uninstall?.();
    uninstall = null;
  });

  it('constructs a ChartInstance, adds a series, and sets data with plain DOM + core APIs', () => {
    const handle = installCanvasMock();
    uninstall = handle.uninstall;

    registerBuiltinSeries();

    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
    container.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: 400,
        right: 800,
        width: 800,
        height: 400,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.appendChild(container);

    const chart = new ChartInstance(container);
    const seriesId = chart.addSeries(CandlestickSeriesDef, {});
    chart.setSeriesData(seriesId, [
      { time: 1, open: 10, high: 12, low: 9, close: 11 },
      { time: 2, open: 11, high: 13, low: 10, close: 12 },
    ]);

    expect(chart.getSeriesIds()).toEqual([seriesId]);
    expect(chart.getLastValue(seriesId)?.value).toBe(12);

    chart.destroy();
    container.remove();
  });
});
