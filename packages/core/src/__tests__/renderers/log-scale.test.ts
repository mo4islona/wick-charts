import { describe, expect, it } from 'vitest';

import { TimeSeriesStore } from '../../data/store';
import { logScale } from '../../scales/log-scale';
import { BarRenderer } from '../../series/bar';
import { CandlestickRenderer } from '../../series/candlestick';
import { LineRenderer } from '../../series/line';
import type { CanvasRecorder } from '../../testing/recording-context';
import type { OHLCData, TimePoint } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

function points(values: number[]): TimePoint[] {
  return values.map((value, i) => ({ time: i * 10 + 5, value }));
}

/** Every numeric argument the renderer handed the canvas. */
function numericArgs(spy: CanvasRecorder): number[] {
  return spy.calls.flatMap((call) => call.args.filter((arg): arg is number => typeof arg === 'number'));
}

describe('series on a log Y scale', () => {
  it('line breaks at values ≤ 0 and hands the canvas no NaN', () => {
    const r = new LineRenderer(1, { area: { visible: false }, entryAnimation: 'none' });
    r.setData(points([1, 10, 0, 100, -3, 1000, 5000]), 0);
    const { ctx, spy } = buildRenderContext({ yRange: { min: 1, max: 10_000 }, yTransform: logScale() });
    r.render(ctx);

    // Runs: [1, 10] · [100] (orphan dot) · [1000, 5000].
    expect(spy.countOf('moveTo')).toBe(3);
    expect(spy.countOf('lineTo')).toBe(2);
    expect(spy.countOf('arc')).toBe(1);
    expect(numericArgs(spy).every(Number.isFinite)).toBe(true);
  });

  it('line area fill closes to the plot floor', () => {
    const r = new LineRenderer(1, { area: { visible: true }, entryAnimation: 'none' });
    r.setData(points([2, 20, 200]), 0);
    const { ctx, spy } = buildRenderContext({ yRange: { min: 1, max: 1000 }, yTransform: logScale() });
    r.render(ctx);

    const floorDrops = spy.callsOf('lineTo').filter((call) => call.args[1] === 400);
    expect(floorDrops).toHaveLength(2);
  });

  it('bar skips values ≤ 0', () => {
    const r = new BarRenderer(1, { cornerRadius: 0, entryAnimation: 'none' });
    r.setData(points([0, 10, -5, 100, 1000]));
    const { ctx, spy } = buildRenderContext({ yRange: { min: 1, max: 10_000 }, yTransform: logScale() });
    r.render(ctx);

    expect(spy.countOf('fillRect')).toBe(3);
    expect(numericArgs(spy).every(Number.isFinite)).toBe(true);
  });

  it('bar layer fade moves a bar by the same pixels as on a linear axis', () => {
    // 10^k on a log axis from 1 sits where k sits on a linear axis from 0.
    const render = (axis: 'linear' | 'log') => {
      const value = (k: number) => (axis === 'log' ? 10 ** k : k);
      const r = new BarRenderer(2, { cornerRadius: 0, entryAnimation: 'none' });
      r.setData(points([3, 2].map(value)), 0);
      r.setData(points([1, 2.5].map(value)), 1);
      r.setLayerAlpha(1, 0.5, 0);

      const { ctx, spy } =
        axis === 'log'
          ? buildRenderContext({ yRange: { min: 1, max: 10_000 }, yTransform: logScale() })
          : buildRenderContext({ yRange: { min: 0, max: 4 } });
      r.render(ctx);

      return spy.callsOf('fillRect').map((call) => [call.args[1] as number, call.args[3] as number]);
    };

    const expected = render('linear');
    const actual = render('log');
    expect(actual).toHaveLength(expected.length);
    for (let i = 0; i < expected.length; i++) {
      expect(actual[i][0]).toBeCloseTo(expected[i][0], 0);
      expect(actual[i][1]).toBeCloseTo(expected[i][1], 0);
    }
  });

  it('stacked bars: a fading bottom layer sinks evenly and the layer above stays on it', () => {
    const r = new BarRenderer(2, { cornerRadius: 0, entryAnimation: 'none', stacking: 'normal' });
    r.setData([{ time: 50, value: 1000 }], 0);
    r.setData([{ time: 50, value: 10 }], 1);
    r.setLayerAlpha(0, 0.5, 0);
    const { ctx, spy } = buildRenderContext({ yRange: { min: 1, max: 10_000 }, yTransform: logScale() });
    r.render(ctx);

    const [bottom, top] = spy.callsOf('fillRect');
    // Halfway from 1000's 100px to the 400px floor.
    expect(bottom.args[1] as number).toBeCloseTo(250, 0);
    expect((top.args[1] as number) + (top.args[3] as number)).toBe(bottom.args[1]);
    // The 10-thick layer stays a thin band instead of stretching over the gap.
    expect(top.args[3] as number).toBeLessThan(15);
  });

  it('stacked line: a fading layer sinks by the same pixels as on a linear axis', () => {
    const exponents = [1, 3, 2];
    const render = (axis: 'linear' | 'log') => {
      const value = (k: number) => (axis === 'log' ? 10 ** k : k);
      const r = new LineRenderer(2, { stacking: 'normal', area: { visible: false }, entryAnimation: 'none' });
      r.setData(points(exponents.map(value)), 0);
      r.setData(points(exponents.map(() => value(1))), 1);
      r.setLayerAlpha(1, 0, 0);
      r.setLayerAlpha(0, 0.5, 0);

      const { ctx, spy } =
        axis === 'log'
          ? buildRenderContext({ yRange: { min: 1, max: 1000 }, yTransform: logScale() })
          : buildRenderContext({ yRange: { min: 0, max: 3 } });
      r.render(ctx);

      return [...spy.callsOf('moveTo'), ...spy.callsOf('lineTo')].map((call) => call.args[1] as number);
    };

    const expected = render('linear');
    const actual = render('log');
    expect(actual.length).toBeGreaterThan(0);
    expect(actual).toHaveLength(expected.length);
    for (let i = 0; i < expected.length; i++) {
      expect(actual[i]).toBeCloseTo(expected[i], 6);
    }
  });

  it('candlestick skips candles with a price ≤ 0', () => {
    const store = new TimeSeriesStore<OHLCData>();
    store.setData([
      { time: 10, open: 10, high: 12, low: 9, close: 11 },
      { time: 30, open: 12, high: 13, low: 0, close: 9 },
      { time: 50, open: 100, high: 120, low: 90, close: 110 },
    ]);
    const r = new CandlestickRenderer(store, { cornerRadius: 0 });
    const { ctx, spy } = buildRenderContext({ yRange: { min: 1, max: 1000 }, yTransform: logScale() });
    r.render(ctx);

    // Two candles × (wick + body).
    expect(spy.countOf('fillRect')).toBe(4);
    expect(numericArgs(spy).every(Number.isFinite)).toBe(true);
  });
});

const positive = (value: number) => value > 0;

describe('getValueRange({ plottable })', () => {
  it('line leaves out values ≤ 0', () => {
    const r = new LineRenderer(1);
    r.setData(points([-4, 0, 3, 50]), 0);

    expect(r.getValueRange(0, 100)).toEqual({ min: -4, max: 50 });
    expect(r.getValueRange(0, 100, { plottable: positive })).toEqual({ min: 3, max: 50 });
  });

  it('line returns null when nothing positive is in view', () => {
    const r = new LineRenderer(1);
    r.setData(points([-4, 0]), 0);

    expect(r.getValueRange(0, 100, { plottable: positive })).toBeNull();
  });

  it('a normal stack bottoms out at its lowest positive edge, not at zero', () => {
    const r = new LineRenderer(2, { stacking: 'normal' });
    r.setData(points([5, 0, 8]), 0);
    r.setData(points([10, 20, -3]), 1);

    // Columns: 5 → 15 · 20 (layer 0 is zero) · 8 (layer 1 is negative, adds nothing).
    expect(r.getValueRange(0, 100, { plottable: positive })).toEqual({ min: 5, max: 20 });
  });

  it('candlestick leaves out candles with a price ≤ 0', () => {
    const store = new TimeSeriesStore<OHLCData>();
    store.setData([
      { time: 10, open: 2, high: 3, low: 0, close: 2 },
      { time: 30, open: 5, high: 8, low: 4, close: 6 },
    ]);
    const r = new CandlestickRenderer(store);

    expect(r.getValueRange(0, 100, { plottable: positive })).toEqual({ min: 4, max: 8 });
  });
});
