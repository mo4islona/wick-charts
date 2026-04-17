import { describe, expect, it } from 'vitest';

import { TimeSeriesStore } from '../../data/store';
import { CandlestickRenderer } from '../../series/candlestick';
import type { OHLCData } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

function mkStore(data: OHLCData[]): TimeSeriesStore<OHLCData> {
  const s = new TimeSeriesStore<OHLCData>();
  s.setData(data);
  return s;
}

const BULL = { open: 10, high: 12, low: 9, close: 11 };
const BEAR = { open: 12, high: 13, low: 8, close: 9 };

describe('CandlestickRenderer.render', () => {
  it('empty data → zero draw calls', () => {
    const { ctx, spy } = buildRenderContext();
    const r = new CandlestickRenderer(mkStore([]));
    r.render(ctx);
    expect(spy.calls).toHaveLength(0);
  });

  it('draws one body fillRect per candle (plus one wick fillRect per candle)', () => {
    const data: OHLCData[] = [
      { time: 10, ...BULL },
      { time: 30, ...BULL },
      { time: 50, ...BULL },
    ];
    // Disable gradient so body uses a solid fillStyle we can distinguish.
    const r = new CandlestickRenderer(mkStore(data), { candleGradient: false });
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);

    // 3 wicks + 3 bodies = 6 fillRects, no volume (volume absent on data).
    expect(spy.countOf('fillRect')).toBe(6);
  });

  it('bull candle body uses upColor; bear candle body uses downColor', () => {
    const data: OHLCData[] = [
      { time: 10, ...BULL },
      { time: 50, ...BEAR },
    ];
    const r = new CandlestickRenderer(mkStore(data), {
      upColor: '#00ff00',
      downColor: '#ff0000',
      wickUpColor: '#005500',
      wickDownColor: '#550000',
      bodyWidthRatio: 0.6,
      candleGradient: false,
    });
    const { ctx, spy } = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 20 } });
    r.render(ctx);

    // Renderer groups bulls then bears; wicks fire first (fillStyle set once
    // per batch), then bodies (fillStyle set once per batch).
    const fillRects = spy.callsOf('fillRect');
    // 2 wicks + 2 bodies = 4
    expect(fillRects).toHaveLength(4);

    // Bodies are drawn with their respective body colors.
    const bodyColors = fillRects.map((c) => c.fillStyle).filter((s) => s === '#00ff00' || s === '#ff0000');
    expect(bodyColors).toContain('#00ff00');
    expect(bodyColors).toContain('#ff0000');
  });

  it('wick uses wickColor (separate from body color), rendered as a thin fillRect', () => {
    const data: OHLCData[] = [{ time: 50, ...BULL }];
    const r = new CandlestickRenderer(mkStore(data), {
      upColor: '#00ff00',
      downColor: '#ff0000',
      wickUpColor: '#112233',
      wickDownColor: '#332211',
      bodyWidthRatio: 0.6,
      candleGradient: false,
    });
    const { ctx, spy } = buildRenderContext({ yRange: { min: 0, max: 20 } });
    r.render(ctx);

    const fillRects = spy.callsOf('fillRect');
    expect(fillRects).toHaveLength(2);
    // Wick is drawn first (before body) and carries wickUpColor.
    expect(fillRects[0].fillStyle).toBe('#112233');
    // Wick height is `lowY - highY` → low (9) is below high (12), so height > 0.
    expect(fillRects[0].args[3]).toBeGreaterThan(0);
  });

  it('applies a gradient to candle bodies when candleGradient !== false', () => {
    const data: OHLCData[] = [{ time: 50, ...BULL }];
    const r = new CandlestickRenderer(mkStore(data), { upColor: '#00ff00' });
    const { ctx, spy } = buildRenderContext({ yRange: { min: 0, max: 20 } });
    r.render(ctx);

    // The body fillRect should have a gradient fillStyle — serialized as
    // `gradient(linear;...)` by the recording context.
    const bodyRect = spy.callsOf('fillRect').at(-1);
    expect(bodyRect?.fillStyle).toContain('gradient(linear');
  });

  it('draws volume overlay bars when volume is present', () => {
    const data: OHLCData[] = [
      { time: 10, ...BULL, volume: 100 },
      { time: 50, ...BULL, volume: 200 },
    ];
    const r = new CandlestickRenderer(mkStore(data), { candleGradient: false });
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);

    // 2 volume + 2 wicks + 2 bodies = 6 fillRects (volume only present when `volume` is defined and > 0).
    expect(spy.countOf('fillRect')).toBe(6);
  });

  it('omits volume overlay when every volume is 0 or undefined', () => {
    const data: OHLCData[] = [
      { time: 10, ...BULL, volume: 0 },
      { time: 50, ...BULL },
    ];
    const r = new CandlestickRenderer(mkStore(data), { candleGradient: false });
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);

    // No volume bars — 2 wicks + 2 bodies.
    expect(spy.countOf('fillRect')).toBe(4);
  });

  it('slices by visibleRange — far-out-of-range candles are not drawn', () => {
    // Store pads by one candle on each side (for continuity across edges), so
    // assert on far-outside candles whose neighbors are also outside.
    const data: OHLCData[] = [
      { time: 0, ...BULL },
      { time: 10, ...BULL },
      { time: 60, ...BULL },
      { time: 61, ...BULL },
      { time: 500, ...BULL },
      { time: 600, ...BULL },
    ];
    const r = new CandlestickRenderer(mkStore(data), { candleGradient: false });
    const { ctx, spy } = buildRenderContext({ timeRange: { from: 50, to: 100 } });
    r.render(ctx);

    // Visible [60, 61] + one padding candle each side = 4 candles × 2 (wick+body) = 8.
    // Candles at time 0 and 600 are past the padding and must not appear.
    expect(spy.countOf('fillRect')).toBe(8);
  });

  it('setData with mixed Date/number times normalizes all entries (regression #4)', () => {
    const r = new CandlestickRenderer(new TimeSeriesStore<OHLCData>(), { candleGradient: false });
    // Date only in the middle — old buggy code kept it as Date, rendering at NaN.
    r.setData([
      { time: 10, ...BULL },
      { time: new Date(30), ...BULL },
      { time: 50, ...BULL },
    ]);
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);

    const fillRects = spy.callsOf('fillRect');
    // Every fillRect must have a finite x coordinate — a leaked Date would
    // produce NaN through timeScale.timeToBitmapX.
    for (const call of fillRects) {
      const x = call.args[0] as number;
      expect(Number.isFinite(x)).toBe(true);
    }
  });
});
