// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance } from '../chart';
import type { ChartOptions } from '../chart/options';
import type { TimePoint } from '../types';
import { installRaf, makeChartContainer } from './helpers/fake-raf';

const INTERVAL = 60_000;
const START = 1_000_000;
// 400px container minus the 30px X axis.
const PLOT_HEIGHT = 370;
// Default 20px padding, applied as a share of the data range, so the gutter
// the data leaves at each edge is 20 · 370 / (370 + 40).
const GUTTER = (20 * PLOT_HEIGHT) / (PLOT_HEIGHT + 40);

function series(values: number[]): TimePoint[] {
  return values.map((value, i) => ({ time: START + i * INTERVAL, value }));
}

describe('ChartInstance with a log Y scale', () => {
  let raf: ReturnType<typeof installRaf>;
  let container: HTMLElement;
  let chart: ChartInstance;

  function makeChart(options: ChartOptions = { axis: { y: { type: 'log' } } }): ChartInstance {
    container = makeChartContainer();
    chart = new ChartInstance(container, { interactive: false, ...options });

    return chart;
  }

  beforeEach(() => {
    raf = installRaf();
  });

  afterEach(() => {
    chart?.destroy();
    container?.remove();
    raf.uninstall();
    vi.restoreAllMocks();
  });

  it('pads the fitted range in log space, so the top and bottom gutters match', () => {
    makeChart();
    const id = chart.addSeries('line');
    chart.setSeriesData(id, series([1, 10, 100, 1000, 10_000]));

    expect(chart.yScale.valueToY(10_000)).toBeCloseTo(GUTTER, 6);
    expect(chart.yScale.valueToY(1)).toBeCloseTo(PLOT_HEIGHT - GUTTER, 6);
    expect(chart.yScale.niceTickValues()).toEqual([1, 10, 100, 1000, 10_000]);
  });

  it('reports ranges as values, not as log exponents', () => {
    makeChart();
    const id = chart.addSeries('line');
    chart.setSeriesData(id, series([1, 10, 100, 1000, 10_000]));

    const { yRange } = chart.getAnimationState();
    expect(yRange.min).toBeCloseTo(1, 9);
    expect(yRange.max).toBeCloseTo(10_000, 6);
    expect(chart.getYRange().min).toBeLessThan(1);
    expect(chart.getYRange().min).toBeGreaterThan(0);
  });

  it('fits only the values it can place and warns once about the rest', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    makeChart();
    const id = chart.addSeries('line');
    chart.setSeriesData(id, series([-5, 0, 2, 20, 200]));

    expect(chart.yScale.valueToY(2)).toBeCloseTo(PLOT_HEIGHT - GUTTER, 6);
    expect(chart.yScale.valueToY(200)).toBeCloseTo(GUTTER, 6);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('≤ 0');

    chart.appendData(id, { time: START + 5 * INTERVAL, value: 0 });
    raf.flush(5);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does not warn for zeros inside a normal stack', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    makeChart();
    const id = chart.addSeries('line', { layers: 2, stacking: 'normal' });
    chart.setSeriesData(id, series([5, 0, 8]), 0);
    chart.setSeriesData(id, series([10, 20, 30]), 1);

    expect(warn).not.toHaveBeenCalled();
  });

  it('ignores a fixed bound ≤ 0 in favor of auto, with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    makeChart({ axis: { y: { type: 'log', min: 0 } } });
    const id = chart.addSeries('line');
    chart.setSeriesData(id, series([10, 100, 1000]));

    expect(chart.yScale.valueToY(10)).toBeCloseTo(PLOT_HEIGHT - GUTTER, 6);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('axis.y.min'));
  });

  it('eases both bounds along the same log-space path', () => {
    makeChart();
    const id = chart.addSeries('line');
    // One decade per 10 points: 1 … 1e5.
    chart.setSeriesData(id, series(Array.from({ length: 51 }, (_, i) => 10 ** (i / 10))));

    chart.setVisibleRange({ from: START + 20 * INTERVAL, to: START + 40 * INTERVAL }, { gesture: true });
    raf.flush(120);
    const start = chart.getAnimationState().yRange;

    chart.setVisibleRange({ from: START, to: START + 10 * INTERVAL }, { gesture: true });
    const frames: { min: number; max: number }[] = [];
    for (let i = 0; i < 20; i++) {
      raf.flush(1);
      frames.push({ ...chart.getAnimationState().yRange });
    }
    raf.flush(120);
    const end = chart.getAnimationState().yRange;
    expect(Math.log10(start.max) - Math.log10(end.max)).toBeGreaterThan(2);

    // Animated in log space, both bounds sit at the same fraction of their
    // log10 path on every frame. A linear-space ease would run the min well
    // ahead of the max here.
    const progress = (value: number, side: 'min' | 'max') =>
      (Math.log10(value) - Math.log10(start[side])) / (Math.log10(end[side]) - Math.log10(start[side]));

    const inFlight = frames.filter((y) => progress(y.min, 'min') > 0.01 && progress(y.min, 'min') < 0.99);
    expect(inFlight.length).toBeGreaterThan(2);
    for (const y of inFlight) {
      expect(progress(y.max, 'max')).toBeCloseTo(progress(y.min, 'min'), 6);
    }
  });

  describe('percent stacking', () => {
    it('is rejected when added to a log chart', () => {
      makeChart();

      expect(() => chart.addSeries('line', { layers: 2, stacking: 'percent' })).toThrow(/stacking: 'percent'/);
      expect(chart.getSeriesIds()).toEqual([]);
    });

    it('is rejected when a series switches to it on a log chart', () => {
      makeChart();
      const id = chart.addSeries('bar', { layers: 2, stacking: 'normal' });

      expect(() => chart.updateSeriesOptions(id, { stacking: 'percent' })).toThrow(/log Y scale/);
    });

    it('blocks switching the axis to log, leaving it linear', () => {
      makeChart({});
      chart.addSeries('line', { layers: 2, stacking: 'percent' });

      expect(() => chart.setAxis({ y: { type: 'log' } })).toThrow(/stacking: 'percent'/);
      expect(chart.yScale.getType()).toBe('linear');
    });
  });

  describe('switching the type at runtime', () => {
    it('refits to the new mapping without stale ticks or NaN', () => {
      makeChart({});
      const id = chart.addSeries('line');
      chart.setSeriesData(id, series([1, 10, 100, 1000, 10_000]));
      raf.flush(40);
      expect(chart.yScale.valueToY(5000.5)).toBeCloseTo(PLOT_HEIGHT / 2, 6);

      chart.setAxis({ y: { type: 'log' } });
      expect(chart.yScale.valueToY(10_000)).toBeCloseTo(GUTTER, 6);
      expect(chart.yScale.valueToY(1)).toBeCloseTo(PLOT_HEIGHT - GUTTER, 6);

      raf.flush(40);
      const logTicks = chart.yScale.tickTracker.snapshot().entries.map((e) => e.value);
      expect(logTicks).toEqual([1, 10, 100, 1000, 10_000]);

      chart.setAxis({});
      expect(chart.yScale.getType()).toBe('linear');
      expect(chart.yScale.valueToY(5000.5)).toBeCloseTo(PLOT_HEIGHT / 2, 6);
    });

    it('lands on a finite range when there is nothing to refit to', () => {
      makeChart({});
      const id = chart.addSeries('line');
      chart.setSeriesData(id, series([-50, -10, -1]));
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      chart.setAxis({ y: { type: 'log' } });
      raf.flush(10);

      const { min, max } = chart.getYRange();
      expect(Number.isFinite(min) && Number.isFinite(max)).toBe(true);
      expect(Number.isFinite(chart.yScale.valueToY(5))).toBe(true);
    });
  });
});
