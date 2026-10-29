import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TimeSeriesStore } from '../../data/store';
import { logScale } from '../../scales/log-scale';
import { CandlestickRenderer } from '../../series/candlestick';
import { roundedCandleFill } from '../../series/painters/builtins';
import type { CandlePaintArgs, CandlePainter } from '../../series/painters/types';
import type { CandlestickSeriesOptions, OHLCData } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

function mkStore(data: OHLCData[]): TimeSeriesStore<OHLCData> {
  const s = new TimeSeriesStore<OHLCData>();
  s.setData(data);
  return s;
}

// Wide slot (dataInterval 25 over the default [0,100] window) + tall bodies so
// the default 2px radius is never clamped away — rounding is unambiguous.
const WIDE = { yRange: { min: 0, max: 100 }, dataInterval: 25 } as const;
const TALL_BULL: Omit<OHLCData, 'time'>[] = [
  { open: 20, high: 95, low: 10, close: 80 },
  { open: 30, high: 96, low: 20, close: 85 },
  { open: 25, high: 92, low: 15, close: 82 },
];
const tallBulls = (): OHLCData[] => TALL_BULL.map((c, i) => ({ time: 25 * (i + 1), ...c }));

describe('CandlestickRenderer — rounded bodies (default)', () => {
  it('rounds a tall body with four arcs and fills with the body color', () => {
    const r = new CandlestickRenderer(mkStore(tallBulls()), { up: { body: '#22cc88', wick: '#115544' } });
    const { ctx, spy } = buildRenderContext(WIDE);
    r.render(ctx);

    // 3 bodies × 4 corners; one fill per body (wicks stay fillRect).
    expect(spy.countOf('arcTo')).toBe(12);
    expect(spy.countOf('fill')).toBe(3);
    for (const f of spy.callsOf('fill')) {
      expect(f.fillStyle).toBe('#22cc88');
    }
  });

  it('preserves the [top,bottom] gradient on a rounded body', () => {
    const r = new CandlestickRenderer(mkStore(tallBulls()), { up: { body: ['#aaff00', '#008800'], wick: '#00ff00' } });
    const { ctx, spy } = buildRenderContext(WIDE);
    r.render(ctx);

    const bodyFill = spy.callsOf('fill').at(-1);
    expect(String(bodyFill?.fillStyle)).toContain('gradient(linear');
  });

  it('builds exactly one gradient per candle — the painter never rebuilds it (#10b)', () => {
    const grad = { up: { body: ['#aaff00', '#008800'] as [string, string], wick: '#00ff00' } };
    const rounded = buildRenderContext(WIDE);
    new CandlestickRenderer(mkStore(tallBulls()), grad).render(rounded.ctx);

    const square = buildRenderContext(WIDE);
    new CandlestickRenderer(mkStore(tallBulls()), { cornerRadius: 0, ...grad }).render(square.ctx);

    // The engine builds one gradient per distinct body height in BOTH paths;
    // the rounded painter reuses it rather than creating a second.
    expect(rounded.spy.countOf('createLinearGradient')).toBe(3);
    expect(rounded.spy.countOf('createLinearGradient')).toBe(square.spy.countOf('createLinearGradient'));
  });

  it('reuses cached body gradients across frames and across same-height candles', () => {
    const grad = { up: { body: ['#aaff00', '#008800'] as [string, string], wick: '#00ff00' } };
    const r = new CandlestickRenderer(mkStore(tallBulls()), grad);
    const { ctx, spy } = buildRenderContext(WIDE);

    r.render(ctx);
    const firstFrame = spy.countOf('createLinearGradient');
    expect(firstFrame).toBe(3); // three distinct heights

    // Second frame, identical geometry — every gradient comes from the cache.
    r.render(ctx);
    expect(spy.countOf('createLinearGradient')).toBe(firstFrame);

    // Same-height candles share one gradient within a frame.
    const sameHeight: OHLCData[] = [1, 2, 3].map((i) => ({
      time: 25 * i,
      open: 20,
      high: 95,
      low: 10,
      close: 80,
    }));
    const r2 = new CandlestickRenderer(mkStore(sameHeight), grad);
    const fresh = buildRenderContext(WIDE);
    r2.render(fresh.ctx);
    expect(fresh.spy.countOf('createLinearGradient')).toBe(1);
  });

  it('a ≤2px doji body degrades to a flat fillRect without throwing (#11)', () => {
    // open === close → 1px body, radius clamps below 1.
    const r = new CandlestickRenderer(mkStore([{ time: 50, open: 50, high: 60, low: 40, close: 50 }]), {
      up: { body: '#22cc88', wick: '#115544' },
    });
    const { ctx, spy } = buildRenderContext(WIDE);
    expect(() => r.render(ctx)).not.toThrow();

    expect(spy.countOf('arcTo')).toBe(0);
    // wick + body = 2 fillRects, every numeric arg finite.
    expect(spy.countOf('fillRect')).toBe(2);
    for (const call of spy.calls) {
      for (const arg of call.args) {
        if (typeof arg === 'number') expect(Number.isFinite(arg)).toBe(true);
      }
    }
  });

  it('cornerRadius:0 keeps the body on the square fillRect path', () => {
    const r = new CandlestickRenderer(mkStore(tallBulls()), {
      cornerRadius: 0,
      up: { body: '#22cc88', wick: '#115544' },
    });
    const { ctx, spy } = buildRenderContext(WIDE);
    r.render(ctx);

    expect(spy.countOf('arcTo')).toBe(0);
    expect(spy.countOf('fill')).toBe(0);
    // 3 wicks + 3 bodies = 6 fillRects.
    expect(spy.countOf('fillRect')).toBe(6);
  });
});

describe('CandlestickRenderer — custom candle painter', () => {
  const bullAndBear = (): OHLCData[] => [
    { time: 25, open: 20, high: 95, low: 10, close: 80 }, // bull
    { time: 50, open: 85, high: 95, low: 20, close: 30 }, // bear
  ];

  it('invokes the painter once per wick, then once per body, with all-true corners', () => {
    const seen: CandlePaintArgs[] = [];
    const painter: CandlePainter = (_env, args) => {
      seen.push(args);
    };
    const r = new CandlestickRenderer(mkStore(bullAndBear()), { candlePainter: painter });
    const { ctx } = buildRenderContext(WIDE);
    r.render(ctx);

    // One color group at a time: its wicks, then its bodies.
    expect(seen.map((a) => a.element)).toEqual(['wick', 'body', 'wick', 'body']);
    for (const args of seen) {
      expect(args.corners).toEqual({ tl: true, tr: true, br: true, bl: true });
      expect(args.radius).toBeGreaterThan(0);
      expect(args.body.height).toBeGreaterThan(0);
      expect(args.wick.height).toBeGreaterThanOrEqual(args.body.height);
    }
    expect(seen.some((a) => a.isBullish)).toBe(true);
    expect(seen.some((a) => !a.isBullish)).toBe(true);
  });

  it('hands the wick its own color and the body its fill, with both flat colors on every call', () => {
    const seen: CandlePaintArgs[] = [];
    const painter: CandlePainter = (_env, args) => {
      seen.push(args);
    };
    const r = new CandlestickRenderer(mkStore([bullAndBear()[0]]), {
      up: { body: '#22cc88', wick: '#115544' },
      candlePainter: painter,
    });
    const { ctx } = buildRenderContext(WIDE);
    r.render(ctx);

    const [wick, body] = seen;
    expect(wick.fillStyle).toBe('#115544');
    expect(body.fillStyle).toBe('#22cc88');
    for (const args of seen) {
      expect(args.bodyColor).toBe('#22cc88');
      expect(args.wickColor).toBe('#115544');
    }
  });

  it('puts openY and closeY on the body edges the candle direction implies', () => {
    const seen: CandlePaintArgs[] = [];
    const painter: CandlePainter = (_env, args) => {
      if (args.element === 'body') seen.push(args);
    };
    const r = new CandlestickRenderer(mkStore(bullAndBear()), { cornerRadius: 0, candlePainter: painter });
    const { ctx } = buildRenderContext(WIDE);
    r.render(ctx);

    for (const args of seen) {
      const top = args.body.y;
      const bottom = args.body.y + args.body.height;
      // Canvas Y grows downward: a bullish close is the top edge.
      expect(args.closeY).toBeCloseTo(args.isBullish ? top : bottom, 5);
      expect(args.openY).toBeCloseTo(args.isBullish ? bottom : top, 5);
    }
  });

  it('shifts every rect into the translated frame of a gradient body', () => {
    const seen: CandlePaintArgs[] = [];
    const painter: CandlePainter = (_env, args) => {
      seen.push(args);
    };
    const r = new CandlestickRenderer(mkStore([bullAndBear()[0]]), {
      up: { body: ['#aaff00', '#008800'], wick: '#00ff00' },
      candlePainter: painter,
    });
    const { ctx } = buildRenderContext(WIDE);
    r.render(ctx);

    const [wick, body] = seen;
    expect(String(body.fillStyle)).toContain('gradient(linear');
    expect(body.body.y).toBe(0);
    // The wick keeps its offset from the body in either frame.
    expect(body.wick.y - body.body.y).toBeCloseTo(wick.wick.y - wick.body.y, 5);
  });

  it('clamps the painter radius to half the body geometry (pre-clamped contract)', () => {
    const seen: CandlePaintArgs[] = [];
    const painter: CandlePainter = (_env, args) => {
      if (args.element === 'body') seen.push(args);
    };
    // A short ~2px body (close-open = 0.5 unit over [0,100] @ 400px) → half-height
    // (~1) is below the unclamped 2px default radius, so the clamp must engage.
    const r = new CandlestickRenderer(mkStore([{ time: 50, open: 50, high: 70, low: 30, close: 50.5 }]), {
      candlePainter: painter,
    });
    const { ctx } = buildRenderContext(WIDE);
    r.render(ctx);

    expect(seen).toHaveLength(1);
    const args = seen[0];
    expect(args.radius).toBeCloseTo(Math.min(2, args.body.width / 2, args.body.height / 2), 5);
    expect(args.radius).toBeLessThan(2);
  });

  it('a painter that skips the wick leaves the candle without one', () => {
    const bodyOnly: CandlePainter = (env, args) => {
      if (args.element === 'wick') return;

      roundedCandleFill(env, args);
    };
    const r = new CandlestickRenderer(mkStore([bullAndBear()[0]]), {
      cornerRadius: 0,
      up: { body: '#22cc88', wick: '#115544' },
      candlePainter: bodyOnly,
    });
    const { ctx, spy } = buildRenderContext(WIDE);
    r.render(ctx);

    expect(spy.callsOf('fillRect').map((c) => c.fillStyle)).toEqual(['#22cc88']);
  });

  it("keeps a painter's ctx state inside the candle pass", () => {
    const stroking: CandlePainter = (env) => {
      env.ctx.lineWidth = 7;
      env.ctx.strokeStyle = '#ff00ff';
    };
    const r = new CandlestickRenderer(mkStore(bullAndBear()), { candlePainter: stroking });
    const { ctx } = buildRenderContext(WIDE);
    r.render(ctx);

    expect(ctx.scope.context.lineWidth).toBe(1);
    expect(ctx.scope.context.strokeStyle).toBe('#000000');
  });
});

describe('CandlestickRenderer — colorBy', () => {
  // Falls on its own bar (open 80 → close 60) but rises from the previous close (50).
  const fallingButRising = (): OHLCData[] => [
    { time: 25, open: 40, high: 55, low: 35, close: 50 },
    { time: 50, open: 80, high: 85, low: 55, close: 60 },
  ];
  const colors = { up: { body: '#22cc88', wick: '#22cc88' }, down: { body: '#ee3344', wick: '#ee3344' } };

  function bodyColors(options: Partial<CandlestickSeriesOptions>): string[] {
    const seen: CandlePaintArgs[] = [];
    const painter: CandlePainter = (_env, args) => {
      if (args.element === 'body') seen.push(args);
    };
    const r = new CandlestickRenderer(mkStore(fallingButRising()), { ...colors, ...options, candlePainter: painter });
    const { ctx } = buildRenderContext(WIDE);
    r.render(ctx);

    return [...seen].sort((a, b) => a.body.x - b.body.x).map((a) => a.bodyColor);
  }

  it("colors by the candle's own open by default", () => {
    expect(bodyColors({})).toEqual(['#22cc88', '#ee3344']);
  });

  it("'previousClose' colors by the move from the previous close", () => {
    expect(bodyColors({ colorBy: 'previousClose' })).toEqual(['#22cc88', '#22cc88']);
  });

  it("'previousClose' reads the stored candle before the drawn ones", () => {
    const seen: CandlePaintArgs[] = [];
    const painter: CandlePainter = (_env, args) => {
      if (args.element === 'body') seen.push(args);
    };
    // The window draws from the -300 candle (its one-candle lookbehind); the close it is compared
    // with (50) belongs to the -400 candle, which is not drawn at all.
    const data: OHLCData[] = [
      { time: -400, open: 40, high: 55, low: 35, close: 50 },
      { time: -300, open: 95, high: 96, low: 85, close: 90 },
      { time: 50, open: 80, high: 85, low: 55, close: 60 },
    ];
    const r = new CandlestickRenderer(mkStore(data), { ...colors, colorBy: 'previousClose', candlePainter: painter });
    const { ctx } = buildRenderContext(WIDE);
    r.render(ctx);

    const drawn = [...seen].sort((x, y) => x.body.x - y.body.x).map((x) => x.bodyColor);
    // -300 rises from 50 (falls on its own bar); 50 falls from 90.
    expect(drawn).toEqual(['#22cc88', '#ee3344']);
  });

  it("'previousClose' skips a NaN close before the drawn candles, and `isRising` agrees", () => {
    const seen: CandlePaintArgs[] = [];
    const painter: CandlePainter = (_env, args) => {
      if (args.element === 'body') seen.push(args);
    };
    // The -300 candle falls on its own bar but rises from 50, the last finite close before it.
    const data: OHLCData[] = [
      { time: -400, open: 40, high: 55, low: 35, close: 50 },
      { time: -350, open: 45, high: 60, low: 40, close: Number.NaN },
      { time: -300, open: 95, high: 96, low: 85, close: 90 },
      { time: 50, open: 80, high: 85, low: 55, close: 60 },
    ];
    const r = new CandlestickRenderer(mkStore(data), { ...colors, colorBy: 'previousClose', candlePainter: painter });
    const { ctx } = buildRenderContext(WIDE);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    r.render(ctx);

    const drawn = [...seen].sort((x, y) => x.body.x - y.body.x).map((x) => x.bodyColor);
    expect(drawn).toEqual(['#22cc88', '#ee3344']);
    expect(r.isRising(data[2])).toBe(true);
  });

  it.each([
    ['linear', null],
    ['log', logScale()],
  ])("'previousClose' takes the close of a candle the %s scale cannot plot", (_name, yTransform) => {
    const seen: CandlePaintArgs[] = [];
    const painter: CandlePainter = (_env, args) => {
      if (args.element === 'body') seen.push(args);
    };
    // Closes 100 → 10 → 50; the middle candle's low of 0 has no place on a log scale.
    const data: OHLCData[] = [
      { time: 25, open: 90, high: 110, low: 80, close: 100 },
      { time: 50, open: 100, high: 100, low: 0, close: 10 },
      { time: 75, open: 60, high: 65, low: 45, close: 50 },
    ];
    const r = new CandlestickRenderer(mkStore(data), { ...colors, colorBy: 'previousClose', candlePainter: painter });
    const { ctx } = buildRenderContext({ yRange: { min: 1, max: 1000 }, yTransform, dataInterval: 25 });
    r.render(ctx);

    const last = [...seen].sort((x, y) => x.body.x - y.body.x).at(-1);
    // 50 rises from 10, though it falls on its own bar and sits below 100.
    expect(last?.bodyColor).toBe('#22cc88');
  });

  it('leaves the volume histogram on close vs open', () => {
    const r = new CandlestickRenderer(mkStore(fallingButRising().map((c) => ({ ...c, volume: 1000 }))), {
      ...colors,
      colorBy: 'previousClose',
    });
    const { ctx, spy } = buildRenderContext(WIDE);
    r.render(ctx);

    const volumeFills = spy.calls.filter((c) => String(c.fillStyle).startsWith('rgba'));
    expect(volumeFills.some((c) => String(c.fillStyle).includes('238, 51, 68'))).toBe(true);
  });
});

describe('CandlestickRenderer — rounded body through the entrance transform', () => {
  let now = 0;
  beforeEach(() => {
    now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('an entering candle (progress<1, default radius) rounds under globalAlpha<1 — no square pop', () => {
    const store = mkStore([{ time: 25, open: 20, high: 95, low: 10, close: 80 }]);
    const r = new CandlestickRenderer(store, {
      up: { body: '#22cc88', wick: '#115544' },
      entryAnimation: 'fade-unfold',
      entryMs: 250,
    });
    // Append a tall bull candle and render mid-entrance so its body draws
    // through the needsTransform branch (save → globalAlpha → painter → restore).
    r.appendPoint({ time: 50, open: 20, high: 95, low: 10, close: 85 });
    now += 130; // 130/250 ≈ 0.52 progress
    const { ctx, spy } = buildRenderContext(WIDE);
    r.render(ctx);

    // The entering body is rounded WHILE faded — an arcTo recorded under a
    // sub-1 globalAlpha proves the rounded path ran inside the transform, not a
    // square fillRect.
    expect(spy.callsOf('arcTo').some((a) => a.globalAlpha < 1)).toBe(true);
  });
});

describe('CandlestickRenderer — rounded volume bars', () => {
  // A single candle fills the volume band, so its bar is tall enough to round.
  const withVolume = (radius?: number) =>
    new CandlestickRenderer(mkStore([{ time: 50, open: 20, high: 95, low: 10, close: 80, volume: 1000 }]), {
      up: { body: '#22cc88', wick: '#115544' },
      ...(radius === undefined ? {} : { cornerRadius: radius }),
    });

  it('rounds the free (top) end of a tall volume bar, reusing the candle cornerRadius', () => {
    const r = withVolume();
    const { ctx, spy } = buildRenderContext(WIDE);
    r.render(ctx);

    // The volume bar fills with a translucent (rgba) tint, so its rounded top
    // emits arcTo under that fillStyle — distinct from the body's solid hex fill.
    const volumeArcs = spy.callsOf('arcTo').filter((a) => String(a.fillStyle).includes('rgba'));
    expect(volumeArcs.length).toBeGreaterThan(0);
  });

  it('keeps volume bars square at cornerRadius:0 (byte-identical fillRect)', () => {
    const r = withVolume(0);
    const { ctx, spy } = buildRenderContext(WIDE);
    r.render(ctx);

    // No rounding anywhere; the volume bar paints via a translucent fillRect.
    expect(spy.countOf('arcTo')).toBe(0);
    expect(spy.callsOf('fillRect').some((f) => String(f.fillStyle).includes('rgba'))).toBe(true);
  });
});
