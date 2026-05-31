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
    // Default body is a single string → flat fillStyle (distinguishable in the spy).
    const r = new CandlestickRenderer(mkStore(data), {});
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);

    // 3 wicks + 3 bodies = 6 fillRects, no volume (volume absent on data).
    expect(spy.countOf('fillRect')).toBe(6);
  });

  it('bull candle body uses up.body; bear candle body uses down.body', () => {
    const data: OHLCData[] = [
      { time: 10, ...BULL },
      { time: 50, ...BEAR },
    ];
    const r = new CandlestickRenderer(mkStore(data), {
      up: { body: '#00ff00', wick: '#005500' },
      down: { body: '#ff0000', wick: '#550000' },
      bodyWidthRatio: 0.6,
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

  it('wick uses up.wick (separate from body), rendered as a thin fillRect', () => {
    const data: OHLCData[] = [{ time: 50, ...BULL }];
    const r = new CandlestickRenderer(mkStore(data), {
      up: { body: '#00ff00', wick: '#112233' },
      down: { body: '#ff0000', wick: '#332211' },
      bodyWidthRatio: 0.6,
    });
    const { ctx, spy } = buildRenderContext({ yRange: { min: 0, max: 20 } });
    r.render(ctx);

    const fillRects = spy.callsOf('fillRect');
    expect(fillRects).toHaveLength(2);
    // Wick is drawn first (before body) and carries the up-direction wick color.
    expect(fillRects[0].fillStyle).toBe('#112233');
    // Wick height is `lowY - highY` → low (9) is below high (12), so height > 0.
    expect(fillRects[0].args[3]).toBeGreaterThan(0);
  });

  it('applies a gradient to candle bodies when body is a [top, bottom] tuple', () => {
    const data: OHLCData[] = [{ time: 50, ...BULL }];
    const r = new CandlestickRenderer(mkStore(data), {
      up: { body: ['#aaff00', '#008800'], wick: '#00ff00' },
      down: { body: '#ff0000', wick: '#ff0000' },
      bodyWidthRatio: 0.6,
    });
    const { ctx, spy } = buildRenderContext({ yRange: { min: 0, max: 20 } });
    r.render(ctx);

    // The body fillRect should have a gradient fillStyle — serialized as
    // `gradient(linear;...)` by the recording context.
    const bodyRect = spy.callsOf('fillRect').at(-1);
    expect(bodyRect?.fillStyle).toContain('gradient(linear');
  });

  it('draws a flat body when `body` is a single string', () => {
    const data: OHLCData[] = [{ time: 50, ...BULL }];
    const r = new CandlestickRenderer(mkStore(data), {
      up: { body: '#00ff00', wick: '#00ff00' },
      down: { body: '#ff0000', wick: '#ff0000' },
      bodyWidthRatio: 0.6,
    });
    const { ctx, spy } = buildRenderContext({ yRange: { min: 0, max: 20 } });
    r.render(ctx);

    const bodyRect = spy.callsOf('fillRect').at(-1);
    expect(bodyRect?.fillStyle).toBe('#00ff00');
  });

  it('collapses a tuple-body gradient to a flat top-stop when the candle is ≤ 2px tall', () => {
    // A doji-style candle: open ≈ close → body height collapses to ≤ 2px after
    // y-scaling, so the renderer can't draw a meaningful gradient. Regression
    // guard: the body must paint in the top-stop color, not leak the prior
    // wick's fillStyle.
    const FLAT_BULL = { open: 10.0, high: 10.2, low: 9.8, close: 10.0001 };
    const data: OHLCData[] = [{ time: 50, ...FLAT_BULL }];
    const r = new CandlestickRenderer(mkStore(data), {
      up: { body: ['#aaff00', '#008800'], wick: '#112233' },
      down: { body: '#ff0000', wick: '#ff0000' },
      bodyWidthRatio: 0.6,
    });
    const { ctx, spy } = buildRenderContext({ yRange: { min: 0, max: 20 } });
    r.render(ctx);

    const fillRects = spy.callsOf('fillRect');
    const bodyRect = fillRects.at(-1);
    // Not a gradient (≤ 2px) and not the wick color — top stop of the tuple.
    expect(bodyRect?.fillStyle).toBe('#aaff00');
  });

  it('caps the body and volume widths when a single-candle visible range would produce chart-wide bars', () => {
    // Visible range barely larger than dataInterval → naive barWidthBitmap
    // would claim ~50% of the chart. The cap inside the renderer keeps both
    // the body fillRect and the volume fillRect at a sane fraction of the
    // chart width.
    const r = new CandlestickRenderer(mkStore([{ time: 5, ...BULL, volume: 100 }]));
    const { ctx, spy } = buildRenderContext({
      timeRange: { from: 0, to: 10 },
      yRange: { min: 0, max: 20 },
      dataInterval: 5,
      mediaWidth: 800,
      pixelRatio: 1,
    });
    r.render(ctx);

    // All fillRects (volume + wick + body) must be capped — nothing chart-wide.
    for (const c of spy.callsOf('fillRect')) {
      const width = c.args[2] as number;
      expect(width).toBeLessThanOrEqual(40); // cap is 30 CSS px × pixelRatio=1
    }
  });

  it('does NOT cap bar width on legitimate zoom with ≥ 3 visible candles', () => {
    // Regression: an earlier version of the cap fired on every render. A
    // user zooming in on 3 candles across an 800-px chart (naturalBarWidth
    // ≈ 267 CSS px) must keep the wide bars — the cap only applies to
    // sparse data (≤ 2 visible points).
    const data: OHLCData[] = [
      { time: 10, ...BULL },
      { time: 20, ...BEAR },
      { time: 30, ...BULL },
    ];
    const r = new CandlestickRenderer(mkStore(data));
    // 3 candles visible on a chart ≈ 800 px wide, dataInterval=10, range=30
    // → naturalBarWidth ≈ 800 / 3 = 266. With the cap disabled on n=3, the
    // rendered body/volume should be much wider than the 30-CSS cap.
    const { ctx, spy } = buildRenderContext({
      timeRange: { from: 0, to: 30 },
      yRange: { min: 0, max: 20 },
      dataInterval: 10,
      mediaWidth: 800,
      pixelRatio: 1,
    });
    r.render(ctx);

    const bodyWidths = spy.callsOf('fillRect').map((c) => c.args[2] as number);
    const widestBody = Math.max(...bodyWidths);
    // Natural body should be ~ 0.6 × 267 ≈ 158 px. If the sparse cap fired
    // we'd see ≤ 30 × 0.6 = 18 px. Require > 100 to reject the bug.
    expect(widestBody).toBeGreaterThan(100);
  });

  it('parity fix handles the minimum-width case (bodyWidth=1 with even wick)', () => {
    // Edge case: when the natural body is extremely narrow (≤ 1 bitmap-px)
    // and DPR makes the wick 2 px, the old `bodyWidth > 1` guard silently
    // skipped the parity alignment, leaving a 0.5-bitmap-px midpoint
    // offset. Fix: bump bodyWidth up to 2 so both widths are even.
    // Force the condition: pixelRatio=2 (wickWidth=2, even), barWidth so
    // small that bodyWidth hits the `Math.max(1, ...)` floor.
    const r = new CandlestickRenderer(mkStore([{ time: 50, ...BULL }]));
    const { ctx, spy } = buildRenderContext({
      // Engineered so that naturalBarWidth ≤ ~4 bitmap px → bodyWidth floors to 1.
      timeRange: { from: 0, to: 10_000 },
      yRange: { min: 0, max: 20 },
      dataInterval: 1,
      mediaWidth: 800,
      pixelRatio: 2,
    });
    r.render(ctx);

    const [wick, body] = spy.callsOf('fillRect');
    const centerOf = (rect: typeof wick) => (rect.args[0] as number) + (rect.args[2] as number) / 2;
    // Midpoints must coincide even at the minimum-width edge.
    expect(centerOf(body)).toBe(centerOf(wick));
  });

  it('wick, body, and volume bar share a vertical axis of symmetry', () => {
    // Prior bug: `bodyWidth = round(barWidth * ratio) − 2` could be odd or
    // even depending on `barWidth`, while `wickWidth` was always
    // `round(horizontalPixelRatio)`. A parity mismatch (one odd, one even)
    // offset the wick by 0.5 bitmap-px from the body's center, giving a
    // visibly non-centered candle. Fix: body width is rounded to match the
    // wick's parity, so their pixel-accurate midpoints coincide.
    //
    // Sweep a handful of `dataInterval` values at DPR=1 (odd wick) and DPR=2
    // (even wick) to exercise both parity paths.
    const cases: { pixelRatio: number; dataInterval: number }[] = [
      { pixelRatio: 1, dataInterval: 5 },
      { pixelRatio: 1, dataInterval: 7 },
      { pixelRatio: 1, dataInterval: 9 },
      { pixelRatio: 2, dataInterval: 5 },
      { pixelRatio: 2, dataInterval: 7 },
      { pixelRatio: 2, dataInterval: 11 },
    ];

    for (const { pixelRatio, dataInterval } of cases) {
      const r = new CandlestickRenderer(mkStore([{ time: 50, ...BULL, volume: 100 }]));
      const { ctx, spy } = buildRenderContext({
        timeRange: { from: 0, to: 100 },
        yRange: { min: 0, max: 20 },
        dataInterval,
        mediaWidth: 800,
        pixelRatio,
      });
      r.render(ctx);

      // Order: [volume, wick, body].
      const fillRects = spy.callsOf('fillRect');
      expect(fillRects).toHaveLength(3);
      const [volume, wick, body] = fillRects;

      const centerOf = (rect: typeof volume) => {
        const x = rect.args[0] as number;
        const width = rect.args[2] as number;
        return x + width / 2;
      };
      const wickCenter = centerOf(wick);
      const bodyCenter = centerOf(body);
      const volumeCenter = centerOf(volume);

      expect(bodyCenter).toBe(wickCenter);
      expect(volumeCenter).toBe(wickCenter);
    }
  });

  it('mixed bull + bear thin candles keep per-direction top-stop colors (stress-page scenario)', () => {
    // Matches the `generateThinCandles` scenario on the stress page: dense
    // rows of bull and bear candles where every body collapses to ≤ 2px.
    // Both directions draw in their own top-stop; neither leaks into the
    // other's color nor into the wick color. The draw order is
    //   bull wicks → bull bodies → bear wicks → bear bodies
    // so the bear-body pass happens after the bear-wick pass has set
    // `ctx.fillStyle = DOWN_WICK`. If the ≤ 2px branch falls through
    // without assigning `fillStyle`, bear bodies paint in `DOWN_WICK`.
    const BULL = { open: 10.0, high: 10.5, low: 9.5, close: 10.01 };
    const BEAR = { open: 10.0, high: 10.5, low: 9.5, close: 9.99 };
    const UP_TOP = '#aaff00';
    const UP_BOTTOM = '#008800';
    const UP_WICK = '#123456';
    const DOWN_TOP = '#ff6666';
    const DOWN_BOTTOM = '#880000';
    const DOWN_WICK = '#654321';

    const data: OHLCData[] = [
      { time: 10, ...BULL },
      { time: 30, ...BEAR },
      { time: 50, ...BULL },
      { time: 70, ...BEAR },
    ];
    const r = new CandlestickRenderer(mkStore(data), {
      up: { body: [UP_TOP, UP_BOTTOM], wick: UP_WICK },
      down: { body: [DOWN_TOP, DOWN_BOTTOM], wick: DOWN_WICK },
      bodyWidthRatio: 0.6,
    });
    // Wide y range so all 4 bodies collapse to ≤ 2 px after scaling.
    const { ctx, spy } = buildRenderContext({ yRange: { min: 0, max: 500 } });
    r.render(ctx);

    // 4 wicks + 4 bodies = 8 fillRects.
    const fillRects = spy.callsOf('fillRect');
    expect(fillRects).toHaveLength(8);

    // Layout: [bull wicks (2)] [bull bodies (2)] [bear wicks (2)] [bear bodies (2)].
    const bullBodies = fillRects.slice(2, 4);
    const bearBodies = fillRects.slice(6, 8);

    for (const rect of bullBodies) {
      expect(rect.fillStyle).toBe(UP_TOP);
      expect(rect.fillStyle).not.toBe(UP_WICK);
      expect(rect.fillStyle).not.toBe(DOWN_TOP);
    }

    for (const rect of bearBodies) {
      expect(rect.fillStyle).toBe(DOWN_TOP);
      expect(rect.fillStyle).not.toBe(DOWN_WICK);
      expect(rect.fillStyle).not.toBe(UP_TOP);
    }
  });

  it('draws volume overlay bars when volume is present', () => {
    const data: OHLCData[] = [
      { time: 10, ...BULL, volume: 100 },
      { time: 50, ...BULL, volume: 200 },
    ];
    const r = new CandlestickRenderer(mkStore(data), {});
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);

    // 2 volume + 2 wicks + 2 bodies = 6 fillRects (volume only present when `volume` is defined and > 0).
    expect(spy.countOf('fillRect')).toBe(6);
  });

  it('volume overlay filters non-finite volumes (no Infinity maxVol, no NaN bar heights)', () => {
    // Prior bug: `maxVol` loop accepted `Infinity` (collapsed every real
    // bar to 1 px because `finite / Infinity → 0`) and `NaN` (silently
    // skipped via `>` returning false, but then `NaN / maxVol = NaN`
    // reached the draw loop). Now both loops filter via `Number.isFinite`.
    const data: OHLCData[] = [
      { time: 10, ...BULL, volume: 100 },
      { time: 20, ...BULL, volume: Number.POSITIVE_INFINITY },
      { time: 30, ...BEAR, volume: Number.NaN },
      { time: 40, ...BULL, volume: null as unknown as number },
      { time: 50, ...BULL, volume: 200 },
    ];
    const r = new CandlestickRenderer(mkStore(data), {});
    const { ctx, spy } = buildRenderContext({ timeRange: { from: 0, to: 60 }, yRange: { min: 0, max: 20 } });
    expect(() => r.render(ctx)).not.toThrow();

    // 5 candles × 2 (wick + body) = 10 candle-geometry fillRects.
    // Volume: only the 2 finite > 0 volumes (100, 200) produce bars.
    expect(spy.countOf('fillRect')).toBe(10 + 2);
    // No non-finite coordinates reached canvas.
    for (const call of spy.calls) {
      for (const arg of call.args) {
        if (typeof arg === 'number') expect(Number.isFinite(arg)).toBe(true);
      }
    }
  });

  it('omits volume overlay when every volume is 0 or undefined', () => {
    const data: OHLCData[] = [
      { time: 10, ...BULL, volume: 0 },
      { time: 50, ...BULL },
    ];
    const r = new CandlestickRenderer(mkStore(data), {});
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);

    // No volume bars — 2 wicks + 2 bodies.
    expect(spy.countOf('fillRect')).toBe(4);
  });

  describe('volume scale eases on zoom (no single-frame snap)', () => {
    // Volume bars are scaled to the tallest bar in the *visible window*. A zoom
    // that drops the tall bar out of view changes that max — without easing the
    // whole band would re-scale in one frame while the candles glide via
    // sticky-Y, reading as a jump. The scale now EMA-chases the window max.

    // Tall bar (vol 1000) far left; the zoom window below excludes it so its
    // max collapses from 1000 → 100.
    const data: OHLCData[] = [
      { time: 10, ...BULL, volume: 1000 },
      { time: 50, ...BULL, volume: 100 },
      { time: 60, ...BULL, volume: 100 },
      { time: 70, ...BULL, volume: 100 },
      { time: 80, ...BULL, volume: 100 },
    ];
    const fullWindow = { from: 0, to: 100 };
    const zoomWindow = { from: 55, to: 85 };
    const yRange = { min: 0, max: 20 };

    // Tallest semi-transparent (volume) bar height in a frame's draw calls.
    const maxVolBarHeight = (spy: ReturnType<typeof buildRenderContext>['spy']): number => {
      const heights = spy
        .callsOf('fillRect')
        .filter((c) => typeof c.fillStyle === 'string' && c.fillStyle.startsWith('rgba'))
        .map((c) => c.args[3] as number);

      return heights.length === 0 ? 0 : Math.max(...heights);
    };

    it('seeds the scale on the first frame — a settled render needs no animation', () => {
      const r = new CandlestickRenderer(mkStore(data), {});
      const { ctx } = buildRenderContext({ timeRange: fullWindow, yRange });
      r.render(ctx);

      expect(r.needsAnimation).toBe(false);
    });

    it('zoom-out does not snap the band — it eases and requests frames until settled', () => {
      // Reference: a fresh renderer painted directly on the zoom window seeds
      // its scale to 100, so its in-window bars fill the band (the snapped height).
      const ref = new CandlestickRenderer(mkStore(data), {});
      const { ctx: refCtx, spy: refSpy } = buildRenderContext({ timeRange: zoomWindow, yRange });
      ref.render(refCtx);
      const snappedHeight = maxVolBarHeight(refSpy);
      expect(snappedHeight).toBeGreaterThan(0);

      // Subject: seed on the full window (scale → 1000), then zoom in one frame.
      const r = new CandlestickRenderer(mkStore(data), {});
      r.render(buildRenderContext({ timeRange: fullWindow, yRange }).ctx);

      const { spy: zoomSpy } = (() => {
        const built = buildRenderContext({ timeRange: zoomWindow, yRange });
        r.render(built.ctx);
        return built;
      })();

      // First zoom frame: scale still near 1000, so the in-window bars are far
      // shorter than the snapped target — proof it did not re-scale instantly.
      expect(maxVolBarHeight(zoomSpy)).toBeLessThan(snappedHeight * 0.5);
      expect(r.needsAnimation).toBe(true);

      // Drive frames until the scale converges; it lands on the snapped height.
      let lastHeight = 0;
      for (let i = 0; i < 200 && r.needsAnimation; i++) {
        const built = buildRenderContext({ timeRange: zoomWindow, yRange });
        r.render(built.ctx);
        lastHeight = maxVolBarHeight(built.spy);
      }
      expect(r.needsAnimation).toBe(false);
      expect(lastHeight).toBeCloseTo(snappedHeight, 0);
    });

    it('never overshoots the band while the scale eases upward (zoom into a taller window)', () => {
      // Seed on a small-volume window, then zoom so a tall bar enters: the scale
      // lags below the new max, so the tall bar would exceed the 20% band
      // without the height clamp.
      const r = new CandlestickRenderer(mkStore(data), {});
      r.render(buildRenderContext({ timeRange: zoomWindow, yRange }).ctx);

      // The band height equals the snapped (fully-scaled) bar — capture it.
      const ref = new CandlestickRenderer(mkStore(data), {});
      const refBuilt = buildRenderContext({ timeRange: zoomWindow, yRange });
      ref.render(refBuilt.ctx);
      const bandHeight = maxVolBarHeight(refBuilt.spy);

      // Zoom out so the vol-1000 bar enters while the scale is still ~100.
      const built = buildRenderContext({ timeRange: fullWindow, yRange });
      r.render(built.ctx);

      expect(maxVolBarHeight(built.spy)).toBeLessThanOrEqual(bandHeight + 0.5);
    });
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
    const r = new CandlestickRenderer(mkStore(data), {});
    const { ctx, spy } = buildRenderContext({ timeRange: { from: 50, to: 100 } });
    r.render(ctx);

    // Visible [60, 61] + one padding candle each side = 4 candles × 2 (wick+body) = 8.
    // Candles at time 0 and 600 are past the padding and must not appear.
    expect(spy.countOf('fillRect')).toBe(8);
  });

  it('setData with mixed Date/number times normalizes all entries (regression #4)', () => {
    const r = new CandlestickRenderer(new TimeSeriesStore<OHLCData>(), {});
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

  it('drops bars with NaN / Infinity OHLC fields and renders the rest (regression: NaN gradient crash)', () => {
    // Bug: introducing gradient bodies (`createLinearGradient`) made the
    // renderer throw mid-paint on `NaN` Y-coordinates, taking down the whole
    // frame. The partition step now filters poisoned bars so the rest of
    // the visible set still renders.
    const data: OHLCData[] = [
      { time: 10, ...BULL },
      { time: 30, open: 10, high: NaN, low: 9, close: 11 },
      { time: 50, open: 12, high: 13, low: 8, close: Number.POSITIVE_INFINITY },
      { time: 70, open: 12, high: 13, low: Number.NEGATIVE_INFINITY, close: 9 },
      { time: 90, ...BEAR },
    ];
    const r = new CandlestickRenderer(mkStore(data));
    const { ctx, spy } = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 20 } });

    expect(() => r.render(ctx)).not.toThrow();

    // 2 surviving candles × (wick + body) = 4 fillRects.
    expect(spy.countOf('fillRect')).toBe(4);

    // No drawn coordinate should be non-finite — proves the poisoned bars
    // never reached `valueToBitmapY`.
    for (const call of spy.callsOf('fillRect')) {
      for (const arg of call.args) {
        if (typeof arg === 'number') expect(Number.isFinite(arg)).toBe(true);
      }
    }
  });

  it('allows null / undefined OHLC fields through (rendered as flat bars, matching legacy behavior)', () => {
    // `null` coerces to `0` through `valueToY`'s arithmetic, which yScale
    // already handles. The pre-`6e76ab5` master branch renders these as
    // thin bars at the Y origin; the NaN filter must not regress that.
    const data: OHLCData[] = [
      { time: 10, ...BULL },
      // biome-ignore lint/suspicious/noExplicitAny: simulate poisoned upstream JSON
      { time: 30, open: 10, high: 12, low: 9, close: null as any },
      // biome-ignore lint/suspicious/noExplicitAny: simulate poisoned upstream JSON
      { time: 50, open: 12, high: undefined as any, low: 8, close: 9 },
    ];
    const r = new CandlestickRenderer(mkStore(data));
    const { ctx, spy } = buildRenderContext({ timeRange: { from: 0, to: 60 }, yRange: { min: 0, max: 20 } });
    r.render(ctx);

    // All three candles render: 3 × (wick + body) = 6.
    expect(spy.countOf('fillRect')).toBe(6);
  });

  it('warns once per renderer with every poisoned index batched into a single message', () => {
    // Data: index 0 clean, index 1 NaN.high, index 2 Infinity.close, index 3 NaN.open, index 4 clean.
    // The warning must list ALL bad indices (1, 2, 3) in one message — not just the first — so the
    // integrator can audit every dirty bar in one pass.
    const data: OHLCData[] = [
      { time: 10, ...BULL },
      { time: 30, open: 10, high: NaN, low: 9, close: 11 },
      { time: 50, open: 12, high: 13, low: 8, close: Number.POSITIVE_INFINITY },
      { time: 70, open: NaN, high: 13, low: 8, close: 9 },
      { time: 90, ...BULL },
    ];
    const r = new CandlestickRenderer(mkStore(data));
    const { ctx } = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 20 } });

    const warns: unknown[][] = [];
    const orig = console.warn;
    console.warn = (...args) => {
      warns.push(args);
    };
    try {
      r.render(ctx);
      r.render(ctx); // second render — should NOT add a second warn for the same renderer
    } finally {
      console.warn = orig;
    }

    expect(warns).toHaveLength(1);
    const msg = String(warns[0][0]);
    expect(msg).toContain('wick-charts');
    expect(msg).toContain('candlestick');
    expect(msg).toContain('skipping 3 rows');
    expect(msg).toContain('indices 1, 2, 3');
    // First offending bar's time embedded for upstream correlation.
    expect(msg).toContain('time 30');
  });

  it('a separately-constructed renderer gets its own warning (closure dedupes per instance, not globally)', () => {
    const data: OHLCData[] = [
      { time: 10, ...BULL },
      { time: 30, open: 10, high: NaN, low: 9, close: 11 },
    ];
    const r1 = new CandlestickRenderer(mkStore(data));
    const r2 = new CandlestickRenderer(mkStore(data));
    const { ctx } = buildRenderContext({ timeRange: { from: 0, to: 40 }, yRange: { min: 0, max: 20 } });

    const warns: unknown[][] = [];
    const orig = console.warn;
    console.warn = (...args) => {
      warns.push(args);
    };
    try {
      r1.render(ctx);
      r2.render(ctx);
    } finally {
      console.warn = orig;
    }

    expect(warns).toHaveLength(2);
  });
});

describe('CandlestickRenderer.getValueRange', () => {
  it('empty range → null', () => {
    const r = new CandlestickRenderer(mkStore([]));
    expect(r.getValueRange(0, 100)).toBeNull();
  });

  it('returns lowest low / highest high across visible candles', () => {
    const r = new CandlestickRenderer(
      mkStore([
        { time: 10, ...BULL }, // low 9, high 12
        { time: 30, ...BEAR }, // low 8, high 13
      ]),
    );
    expect(r.getValueRange(0, 100)).toEqual({ min: 8, max: 13 });
  });

  it('skips a poisoned candle (NaN high/low) instead of corrupting the range', () => {
    const r = new CandlestickRenderer(
      mkStore([
        { time: 10, ...BULL }, // low 9, high 12
        { time: 30, open: Number.NaN, high: Number.NaN, low: Number.NaN, close: Number.NaN },
      ]),
    );
    expect(r.getValueRange(0, 100)).toEqual({ min: 9, max: 12 });
  });
});
