import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TimeSeriesStore } from '../../data/store';
import { CandlestickRenderer } from '../../series/candlestick';
import type { CandlePaintArgs, CandlePainter } from '../../series/painters/types';
import type { OHLCData } from '../../types';
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

    // The engine builds one gradient per candle in BOTH paths; the rounded
    // painter reuses it rather than creating a second.
    expect(rounded.spy.countOf('createLinearGradient')).toBe(3);
    expect(rounded.spy.countOf('createLinearGradient')).toBe(square.spy.countOf('createLinearGradient'));
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
  it('invokes the painter once per body with all-true corners and the isBullish flag', () => {
    const seen: CandlePaintArgs[] = [];
    const painter: CandlePainter = (_env, args) => {
      seen.push(args);
    };
    const r = new CandlestickRenderer(
      mkStore([
        { time: 25, open: 20, high: 95, low: 10, close: 80 }, // bull
        { time: 50, open: 85, high: 95, low: 20, close: 30 }, // bear
      ]),
      { candlePainter: painter },
    );
    const { ctx } = buildRenderContext(WIDE);
    r.render(ctx);

    expect(seen).toHaveLength(2);
    for (const args of seen) {
      expect(args.corners).toEqual({ tl: true, tr: true, br: true, bl: true });
      expect(args.radius).toBeGreaterThan(0);
      expect(args.geom.height).toBeGreaterThan(0);
    }
    expect(seen.some((a) => a.isBullish)).toBe(true);
    expect(seen.some((a) => !a.isBullish)).toBe(true);
  });

  it('clamps the painter radius to half the body geometry (pre-clamped contract)', () => {
    const seen: CandlePaintArgs[] = [];
    const painter: CandlePainter = (_env, args) => {
      seen.push(args);
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
    expect(args.radius).toBeCloseTo(Math.min(2, args.geom.width / 2, args.geom.height / 2), 5);
    expect(args.radius).toBeLessThan(2);
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
