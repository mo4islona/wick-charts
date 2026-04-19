/**
 * Part 1 regression: user-initiated pan/zoom used to fire a synthetic
 * `interact` handler on chart.ts that called `cancelEntranceAnimations()`
 * on every renderer, making last-point tweens snap mid-flight. That handler
 * is gone; this test asserts:
 *   - the chart does NOT subscribe to the viewport's `interact` event, and
 *   - a pan emission leaves per-renderer entrance entries intact.
 */
import { describe, expect, it, vi } from 'vitest';

import { ChartInstance } from '../chart';
import { getChartViewportForTest } from '../internal/test-handles';
import type { CandlestickRenderer } from '../series/candlestick';
import type { LineRenderer } from '../series/line';

function makeChart(): ChartInstance {
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
  container.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 400, width: 800, height: 400, toJSON: () => ({}) }) as DOMRect;

  return new ChartInstance(container);
}

describe('entrance animations survive pan/zoom gestures', () => {
  it('candlestick entries persist when the viewport emits interact', () => {
    const chart = makeChart();
    const id = chart.addCandlestickSeries();
    const renderer = (
      chart as unknown as { listSeriesForTest: () => Array<{ id: string; renderer: CandlestickRenderer }> }
    )
      .listSeriesForTest()
      .find((s) => s.id === id)!.renderer;

    renderer.setData([{ time: 10, open: 10, high: 12, low: 9, close: 11 }]);
    renderer.appendPoint({ time: 20, open: 10, high: 12, low: 9, close: 11 });
    expect(renderer.needsAnimation).toBe(true);

    // Guard: if the chart re-wires a cancel-on-interact listener the spy fires.
    const cancelSpy = vi.spyOn(renderer, 'cancelEntranceAnimations');
    getChartViewportForTest(chart).pan(1, 800);

    expect(cancelSpy).not.toHaveBeenCalled();
    expect(renderer.needsAnimation).toBe(true);
  });

  it('line renderer retains its trailing entrance entry across a pan', () => {
    const chart = makeChart();
    const id = chart.addLineSeries();
    const renderer = (chart as unknown as { listSeriesForTest: () => Array<{ id: string; renderer: LineRenderer }> })
      .listSeriesForTest()
      .find((s) => s.id === id)!.renderer;

    renderer.setData([
      { time: 10, value: 5 },
      { time: 20, value: 6 },
    ]);
    renderer.appendPoint({ time: 30, value: 8 });

    getChartViewportForTest(chart).pan(1, 800);

    const entries = (renderer as unknown as { entries: Array<Map<number, unknown>> }).entries;
    expect(entries[0].has(30)).toBe(true);
    expect(renderer.needsAnimation).toBe(true);
  });
});
