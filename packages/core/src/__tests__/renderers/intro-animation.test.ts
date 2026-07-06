import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TimeSeriesStore } from '../../data/store';
import { BarRenderer } from '../../series/bar';
import { springIntro } from '../../series/bar-intro';
import { CandlestickRenderer } from '../../series/candlestick';
import { wickBodyIntro } from '../../series/candlestick-intro';
import { LineRenderer } from '../../series/line';
import {
  type LineIntroFn,
  type LineIntroFrame,
  centerOutIntro,
  plotterIntro,
  sweepIntro,
  traceIntro,
  unfoldIntro,
} from '../../series/line-intro';
import { PieRenderer } from '../../series/pie';
import { fadeIntro, riseIntro, wipeIntro } from '../../series/wave-intro';
import type { OHLCData, PieSliceData, TimePoint } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

/**
 * Initial-load intro animations. The global test setup reports
 * `prefers-reduced-motion: reduce` (so every other test sees settled first
 * frames); this suite swaps in a motion-allowing `matchMedia` before each
 * test to actually exercise the intros.
 */
const reducedMotionStub = globalThis.matchMedia;

function allowMotion(): void {
  globalThis.matchMedia = ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof globalThis.matchMedia;
}

const BARS: TimePoint[] = [
  { time: 10, value: 5 },
  { time: 90, value: 8 },
];

describe('intro animations — initial-load reveal', () => {
  let now = 0;
  beforeEach(() => {
    allowMotion();
    now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });
  afterEach(() => {
    globalThis.matchMedia = reducedMotionStub;
    vi.restoreAllMocks();
  });

  function advance(ms: number): void {
    now += ms;
  }

  describe('BarRenderer', () => {
    function makeBar(opts: ConstructorParameters<typeof BarRenderer>[1] = {}): BarRenderer {
      return new BarRenderer(1, { cornerRadius: 0, ...opts });
    }

    function renderFrame(r: BarRenderer) {
      const built = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 20 } });
      r.render(built.ctx);

      return built;
    }

    it('arms on the first empty → non-empty seed', () => {
      const r = makeBar();
      expect(r.needsAnimation).toBe(false);

      r.setData(BARS);
      expect(r.needsAnimation).toBe(true);
    });

    it('waves left → right: the left bar is further into its fade-grow than the right', () => {
      const r = makeBar();
      r.setData(BARS);
      renderFrame(r); // stamps the wave start

      advance(150); // left (10% position) is mid-tween; right (90%) has not started
      const { spy } = renderFrame(r);

      const rects = spy.callsOf('fillRect').sort((a, b) => (a.args[0] as number) - (b.args[0] as number));
      expect(rects.length).toBe(2);
      const [left, right] = rects;
      expect(left.globalAlpha).toBeGreaterThan(right.globalAlpha);
      expect(left.globalAlpha).toBeLessThan(1);
    });

    it('settles after the full wave window and paints at full alpha', () => {
      const r = makeBar();
      r.setData(BARS);
      renderFrame(r);

      advance(1001); // 2 × introMs (500) + ε
      const { spy } = renderFrame(r);

      expect(r.needsAnimation).toBe(false);
      for (const rect of spy.callsOf('fillRect')) {
        expect(rect.globalAlpha).toBe(1);
      }
    });

    it('bulk re-seed of a non-empty series does not replay the intro', () => {
      const r = makeBar();
      r.setData(BARS);
      renderFrame(r);
      advance(1001);
      renderFrame(r);
      expect(r.needsAnimation).toBe(false);

      r.setData(BARS);
      expect(r.needsAnimation).toBe(false);
    });

    it('introMs: 0 disables the intro', () => {
      const r = makeBar({ introMs: 0 });
      r.setData(BARS);
      expect(r.needsAnimation).toBe(false);

      const { spy } = renderFrame(r);
      for (const rect of spy.callsOf('fillRect')) {
        expect(rect.globalAlpha).toBe(1);
      }
    });

    it('cancelEntranceAnimations aborts the intro mid-flight', () => {
      const r = makeBar();
      r.setData(BARS);
      renderFrame(r);
      advance(150);
      expect(r.needsAnimation).toBe(true);

      r.cancelEntranceAnimations();
      expect(r.needsAnimation).toBe(false);

      const { spy } = renderFrame(r);
      for (const rect of spy.callsOf('fillRect')) {
        expect(rect.globalAlpha).toBe(1);
      }
    });

    it('prefers-reduced-motion skips the intro entirely', () => {
      globalThis.matchMedia = reducedMotionStub;

      const r = makeBar();
      r.setData(BARS);
      expect(r.needsAnimation).toBe(false);
    });

    it('wipeIntro(): clips to the sweeping front, bars behind it paint settled', () => {
      const r = makeBar({ introAnimation: wipeIntro() });
      r.setData(BARS);
      renderFrame(r);

      advance(500); // halfway through the 2 × 500ms wave window
      const { spy } = renderFrame(r);

      expect(spy.countOf('clip')).toBe(1);
      const clipRect = spy.callsOf('rect')[0];
      const frontX = clipRect.args[2] as number;
      expect(frontX).toBeGreaterThan(0);
      expect(frontX).toBeLessThan(800);

      // No per-bar dimming/growing — the clip alone does the reveal.
      for (const rect of spy.callsOf('fillRect')) {
        expect(rect.globalAlpha).toBe(1);
      }

      advance(1001);
      const settled = renderFrame(r);
      expect(r.needsAnimation).toBe(false);
      expect(settled.spy.countOf('clip')).toBe(0);
    });

    it('riseIntro(): the bar keeps its height but paints below its settled spot, translucent', () => {
      const r = makeBar({ introAnimation: riseIntro() });
      r.setData(BARS);
      renderFrame(r);

      advance(150); // left bar mid-tween
      const mid = renderFrame(r);

      advance(1001);
      const settled = renderFrame(r);

      const leftRect = (spy: (typeof mid)['spy']) => {
        const rect = spy.callsOf('fillRect').find((c) => (c.args[0] as number) < 400);
        if (!rect) throw new Error('left bar not drawn');

        return rect;
      };
      const midRect = leftRect(mid.spy);
      const settledRect = leftRect(settled.spy);

      expect(midRect.args[3] as number).toBeCloseTo(settledRect.args[3] as number, 5);
      expect(midRect.args[1] as number).toBeGreaterThan(settledRect.args[1] as number);
      expect(midRect.globalAlpha).toBeLessThan(1);
    });

    it('springIntro(): the bar overshoots its settled height mid-intro', () => {
      const r = makeBar({ introAnimation: springIntro() });
      r.setData(BARS);
      renderFrame(r);

      advance(235); // left bar eased progress ≈ 0.75 — inside the overshoot region
      const mid = renderFrame(r);

      advance(1001);
      const settled = renderFrame(r);

      const leftHeight = (spy: (typeof mid)['spy']) => {
        const rect = spy.callsOf('fillRect').find((c) => (c.args[0] as number) < 400);
        if (!rect) throw new Error('left bar not drawn');

        return rect.args[3] as number;
      };
      expect(leftHeight(mid.spy)).toBeGreaterThan(leftHeight(settled.spy));
    });
  });

  describe('CandlestickRenderer', () => {
    const CANDLES: OHLCData[] = [
      { time: 10, open: 5, high: 9, low: 3, close: 8 },
      { time: 90, open: 5, high: 9, low: 3, close: 8 },
    ];

    function makeCandle(opts: ConstructorParameters<typeof CandlestickRenderer>[1] = {}): CandlestickRenderer {
      return new CandlestickRenderer(new TimeSeriesStore<OHLCData>(), { cornerRadius: 0, ...opts });
    }

    function renderFrame(r: CandlestickRenderer) {
      const built = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 10 } });
      r.render(built.ctx);

      return built;
    }

    it('arms on the first seed and settles after the wave window', () => {
      const r = makeCandle();
      r.setData(CANDLES);
      expect(r.needsAnimation).toBe(true);

      renderFrame(r);
      advance(1001);
      renderFrame(r);
      expect(r.needsAnimation).toBe(false);
    });

    it('default candleUnfoldIntro(): a candle still waiting for the wave front paints invisible, not a flat line', () => {
      const r = makeCandle();
      r.setData(CANDLES);
      renderFrame(r);

      advance(150); // right candle's wave hasn't started yet
      const { spy } = renderFrame(r);

      const rects = spy.callsOf('fillRect');
      const leftAlphas = rects.filter((c) => (c.args[0] as number) < 400).map((c) => c.globalAlpha);
      const rightAlphas = rects.filter((c) => (c.args[0] as number) >= 400).map((c) => c.globalAlpha);
      expect(Math.max(...leftAlphas)).toBeGreaterThan(0);
      expect(Math.max(...rightAlphas)).toBe(0);
    });

    it('waves left → right with fadeIntro(): the left candle paints more opaque', () => {
      const r = makeCandle({ introAnimation: fadeIntro() });
      r.setData(CANDLES);
      renderFrame(r);

      advance(150);
      const { spy } = renderFrame(r);

      // Bodies + wicks paint as fillRects; group by x-half of the pane.
      const rects = spy.callsOf('fillRect');
      const leftAlphas = rects.filter((c) => (c.args[0] as number) < 400).map((c) => c.globalAlpha);
      const rightAlphas = rects.filter((c) => (c.args[0] as number) >= 400).map((c) => c.globalAlpha);
      expect(leftAlphas.length).toBeGreaterThan(0);
      expect(Math.max(...leftAlphas)).toBeGreaterThan(Math.max(0, ...rightAlphas));
    });

    it('bulk re-seed does not replay; cancel aborts', () => {
      const r = makeCandle();
      r.setData(CANDLES);
      renderFrame(r);
      r.cancelEntranceAnimations();
      expect(r.needsAnimation).toBe(false);

      r.setData(CANDLES);
      expect(r.needsAnimation).toBe(false);
    });

    it('wipeIntro(): clips to the sweeping front, candles behind it paint settled', () => {
      const r = makeCandle({ introAnimation: wipeIntro() });
      r.setData(CANDLES);
      renderFrame(r);

      advance(500); // halfway through the 2 × 500ms wave window
      const { spy } = renderFrame(r);

      expect(spy.countOf('clip')).toBe(1);
      const clipRect = spy.callsOf('rect')[0];
      const frontX = clipRect.args[2] as number;
      expect(frontX).toBeGreaterThan(0);
      expect(frontX).toBeLessThan(800);

      // No per-candle dimming — the clip alone does the reveal.
      for (const rect of spy.callsOf('fillRect')) {
        expect(rect.globalAlpha).toBe(1);
      }

      advance(1001);
      const settled = renderFrame(r);
      expect(r.needsAnimation).toBe(false);
      expect(settled.spy.countOf('clip')).toBe(0);
    });

    it('riseIntro(): candles paint below their settled position mid-intro, translucent', () => {
      const r = makeCandle({ introAnimation: riseIntro() });
      r.setData(CANDLES);
      renderFrame(r);

      advance(150); // left candle mid-tween
      const mid = renderFrame(r);

      advance(1001);
      const settled = renderFrame(r);

      // Top of the left candle's wick: settled at highY, shifted down mid-intro.
      const topOf = (spy: (typeof mid)['spy']) =>
        Math.min(...spy.callsOf('fillRect').flatMap((c) => ((c.args[0] as number) < 400 ? [c.args[1] as number] : [])));
      expect(topOf(mid.spy)).toBeGreaterThan(topOf(settled.spy));

      const leftMid = mid.spy.callsOf('fillRect').filter((c) => (c.args[0] as number) < 400);
      for (const rect of leftMid) {
        expect(rect.globalAlpha).toBeLessThan(1);
      }
    });

    it('wickBodyIntro(): wicks needle out first while bodies are still invisible', () => {
      const r = makeCandle({ introAnimation: wickBodyIntro() });
      r.setData(CANDLES);
      renderFrame(r);

      advance(100); // left candle progress ≈ 0.27 — wick phase only
      const { spy } = renderFrame(r);

      // Wick width is 1 bitmap px at DPR 1; bodies are wider.
      const left = spy.callsOf('fillRect').filter((c) => (c.args[0] as number) < 400);
      const wicks = left.filter((c) => (c.args[2] as number) === 1);
      const bodies = left.filter((c) => (c.args[2] as number) > 1);
      expect(wicks.length).toBeGreaterThan(0);
      expect(bodies.length).toBeGreaterThan(0);

      for (const wick of wicks) {
        expect(wick.globalAlpha).toBe(1);
        expect(wick.args[3] as number).toBeGreaterThan(1);
      }
      for (const body of bodies) {
        expect(body.globalAlpha).toBe(0);
      }

      // The right candle's wave hasn't started at all yet — wick and body
      // should both be invisible, not a flat min-height line at the open price.
      const right = spy.callsOf('fillRect').filter((c) => (c.args[0] as number) >= 400);
      expect(right.length).toBeGreaterThan(0);
      for (const rect of right) {
        expect(rect.globalAlpha).toBe(0);
      }
    });
  });

  describe('LineRenderer', () => {
    const POINTS: TimePoint[] = [
      { time: 0, value: 2 },
      { time: 50, value: 8 },
      { time: 100, value: 5 },
    ];

    function makeLine(opts: ConstructorParameters<typeof LineRenderer>[1] = {}): LineRenderer {
      return new LineRenderer(1, opts);
    }

    function renderFrame(r: LineRenderer) {
      const built = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 10 } });
      r.render(built.ctx);

      return built;
    }

    it('sweepIntro(): clips to the reveal front mid-intro and draws the head glow', () => {
      const r = makeLine({ introAnimation: sweepIntro() });
      r.setData(POINTS);
      renderFrame(r); // stamps the wave start

      advance(500); // halfway through the 1000ms sweep
      const { spy } = renderFrame(r);

      expect(spy.countOf('clip')).toBe(1);
      const clipRect = spy.callsOf('rect')[0];
      const frontX = clipRect.args[2] as number;
      expect(frontX).toBeGreaterThan(0);
      expect(frontX).toBeLessThan(800);

      // Head glow: two arcs (halo + core) from the reused drawPulse path.
      expect(spy.countOf('arc')).toBeGreaterThanOrEqual(2);
      expect(spy.matchesSequence(['save', 'rect', 'clip', 'stroke', 'restore', 'arc'])).toBe(true);
    });

    it('stops clipping once the sweep settles', () => {
      const r = makeLine({ introAnimation: sweepIntro() });
      r.setData(POINTS);
      renderFrame(r);

      advance(1001);
      const { spy } = renderFrame(r);

      expect(r.needsAnimation).toBe(false);
      expect(spy.countOf('clip')).toBe(0);
    });

    it('hands the intro fn the plot-area extent and an xToTime inverse of timeToX', () => {
      let seen: LineIntroFrame | null = null;
      const probe: LineIntroFn = (frame) => {
        seen = frame;

        return {};
      };
      const r = makeLine({ introAnimation: probe });
      r.setData(POINTS);

      // Simulate the axis strips sharing the canvas: the scales span
      // 700×380 of the 800×400 bitmap. The frame must report the scale
      // extent — the canvas size would make width-based x→time math (and
      // `width / 2` centering) land off the data area.
      const built = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 10 } });
      built.timeScale.update({ from: 0, to: 100 }, 700, 1);
      built.yScale.update({ min: 0, max: 10 }, 380, 1);
      r.render(built.ctx);

      const frame = seen as LineIntroFrame | null;
      if (frame === null) throw new Error('intro fn was not invoked');

      expect(frame.width).toBe(700);
      expect(frame.height).toBe(380);
      expect(frame.xToTime(frame.timeToX(42))).toBeCloseTo(42, 6);
      expect(frame.xToTime(700)).toBeCloseTo(100, 6);
    });

    it('parks the head glow on the trailing endpoint once the front passes the last point', () => {
      const r = makeLine({ introAnimation: sweepIntro() });
      r.setData(POINTS); // last point at time 100
      // Right padding, as in the live default: the visible range runs past
      // the data, so the eased front's time overshoots the last sample.
      const stamp = buildRenderContext({ timeRange: { from: 0, to: 130 }, yRange: { min: 0, max: 10 } });
      r.render(stamp.ctx);

      advance(900); // eased front ≈ time 129.5 — well past the last point
      const built = buildRenderContext({ timeRange: { from: 0, to: 130 }, yRange: { min: 0, max: 10 } });
      r.render(built.ctx);

      // Without the clamp the head would ride at ≈ x(129.5) ≈ 797 with a
      // flat-clamped Y, detached from the line, then jump back on settle.
      const arcs = built.spy.callsOf('arc');
      expect(arcs.length).toBeGreaterThanOrEqual(2);
      const endpointX = built.timeScale.timeToBitmapX(100);
      const endpointY = built.yScale.valueToBitmapY(5);
      for (const arc of arcs) {
        expect(arc.args[0] as number).toBeCloseTo(endpointX, 0);
        expect(arc.args[1] as number).toBeCloseTo(endpointY, 0);
      }
    });

    it('cross-fades the pulse dot in over the intro tail instead of popping on settle', () => {
      const r = makeLine({ introAnimation: sweepIntro() });
      r.setData(POINTS);
      renderFrame(r);

      advance(700); // linear 0.7 — before the handoff window opens
      renderFrame(r);
      const early = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 10 } });
      r.drawOverlay(early.overlayCtx());
      expect(early.spy.countOf('arc')).toBe(0);

      advance(200); // linear 0.9 — inside the last-15% handoff window
      renderFrame(r);
      const mid = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 10 } });
      r.drawOverlay(mid.overlayCtx());

      const arcs = mid.spy.callsOf('arc');
      expect(arcs.length).toBeGreaterThan(0);
      for (const arc of arcs) {
        expect(arc.globalAlpha).toBeGreaterThan(0);
        expect(arc.globalAlpha).toBeLessThan(1);
      }
    });

    it('suppresses the pulse dot while the intro sweep runs', () => {
      const r = makeLine({ introAnimation: sweepIntro() });
      r.setData(POINTS);
      renderFrame(r);
      advance(100);

      const built = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 10 } });
      r.drawOverlay(built.overlayCtx());
      expect(built.spy.countOf('arc')).toBe(0);

      advance(1001);
      const settled = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 10 } });
      r.render(settled.ctx);
      const after = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 10 } });
      r.drawOverlay(after.overlayCtx());
      expect(after.spy.countOf('arc')).toBeGreaterThan(0);
    });

    it('defaults to unfoldIntro — the whole line is drawn with no clip mid-intro', () => {
      const r = makeLine();
      r.setData(POINTS);
      renderFrame(r);

      advance(300);
      const { spy } = renderFrame(r);

      expect(r.needsAnimation).toBe(true);
      expect(spy.countOf('clip')).toBe(0);
      expect(spy.countOf('stroke')).toBeGreaterThan(0);
    });

    it('introMs: 0 renders unclipped from the first frame', () => {
      const r = makeLine({ introMs: 0 });
      r.setData(POINTS);
      const { spy } = renderFrame(r);

      expect(spy.countOf('clip')).toBe(0);
      expect(r.needsAnimation).toBe(false);
    });

    /** Y coordinates of the stroked polyline (moveTo + lineTo). */
    function pathYs(spy: ReturnType<typeof buildRenderContext>['spy']): number[] {
      return [...spy.callsOf('moveTo'), ...spy.callsOf('lineTo')].map((c) => c.args[1] as number);
    }

    describe('introAnimation: unfoldIntro()', () => {
      it('starts flat at the mean and unfolds into shape — no clip involved', () => {
        // Area off: its fill polygon's baseline vertices would pollute the
        // stroke-path Y-spread this test measures.
        const r = makeLine({ introAnimation: unfoldIntro(), area: { visible: false } });
        r.setData(POINTS);
        renderFrame(r); // stamps the wave start

        advance(16); // barely started — geometry still nearly flat
        const early = renderFrame(r);
        expect(early.spy.countOf('clip')).toBe(0);
        const earlyYs = pathYs(early.spy);
        expect(earlyYs.length).toBeGreaterThan(0);
        const earlySpread = Math.max(...earlyYs) - Math.min(...earlyYs);

        advance(2000);
        const settled = renderFrame(r);
        const settledYs = pathYs(settled.spy);
        const settledSpread = Math.max(...settledYs) - Math.min(...settledYs);

        // Values 2..8 across a 0..10 range in 400px → real spread ≈ 240px;
        // one frame in, the line should still hug its mean.
        expect(earlySpread).toBeLessThan(settledSpread / 4);
        expect(settledSpread).toBeGreaterThan(100);
        expect(r.needsAnimation).toBe(false);
      });

      it('keeps the pulse dot alive during the unfold', () => {
        const r = makeLine({ introAnimation: unfoldIntro() });
        r.setData(POINTS);
        renderFrame(r);
        advance(100);
        renderFrame(r);

        const built = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 10 } });
        r.drawOverlay(built.overlayCtx());
        expect(built.spy.countOf('arc')).toBeGreaterThan(0);
      });
    });

    describe('introAnimation: plotterIntro()', () => {
      it('front advances by path length — a tall early spike slows it below the linear sweep', () => {
        // Nearly all of the polyline's arc length sits in the first spike;
        // at half the intro the plotter head must still be well left of the
        // x-midpoint (the plain sweep would be at ~400px by then).
        const spiky: TimePoint[] = [
          { time: 0, value: 0 },
          { time: 10, value: 100 },
          { time: 20, value: 0 },
          { time: 60, value: 1 },
          { time: 100, value: 0 },
        ];
        const r = makeLine({ introAnimation: plotterIntro() });
        r.setData(spiky);

        const stamp = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 100 } });
        r.render(stamp.ctx);

        advance(500);
        const mid = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 100 } });
        r.render(mid.ctx);

        expect(mid.spy.countOf('clip')).toBe(1);
        const frontX = mid.spy.callsOf('rect')[0].args[2] as number;
        expect(frontX).toBeGreaterThan(0);
        expect(frontX).toBeLessThan(300);
      });
    });

    describe('custom LineIntroFn', () => {
      it('drives the reveal from a user function — center-out clip window with two heads', () => {
        const centerOut: LineIntroFn = (frame) => {
          const cx = frame.width / 2;
          const half = cx * frame.progress;

          return {
            clip: { fromX: cx - half, toX: cx + half },
            heads: [
              { x: cx - half, time: frame.xToTime(cx - half) },
              { x: cx + half, time: frame.xToTime(cx + half) },
            ],
          };
        };

        const r = makeLine({ introAnimation: centerOut });
        r.setData(POINTS);
        renderFrame(r); // stamps the wave start

        advance(500);
        const { spy } = renderFrame(r);

        expect(spy.countOf('clip')).toBe(1);
        const [x, , w] = spy.callsOf('rect')[0].args as number[];
        // Window centered on the pane: opens from 400 outward.
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(400);
        expect(x + w).toBeGreaterThan(400);
        expect(x + w).toBeLessThan(800);

        // Two heads → at least 4 arcs (halo + core each).
        expect(spy.countOf('arc')).toBeGreaterThanOrEqual(4);
      });

      it('accepts a factory-produced built-in as a function value', () => {
        const r = makeLine({ introAnimation: traceIntro({ ghostAlpha: 0.1 }) });
        r.setData(POINTS);
        renderFrame(r);
        advance(400);
        const { spy } = renderFrame(r);

        const strokes = spy.callsOf('stroke');
        expect(strokes.length).toBe(2);
        expect(strokes[0].globalAlpha).toBeLessThan(0.11);
      });
    });

    describe('introAnimation: traceIntro()', () => {
      it('draws a faint full-length ghost under the clipped ink pass', () => {
        const r = makeLine({ introAnimation: traceIntro() });
        r.setData(POINTS);
        renderFrame(r);

        advance(400);
        const { spy } = renderFrame(r);

        const strokes = spy.callsOf('stroke');
        expect(strokes.length).toBe(2);
        expect(strokes[0].globalAlpha).toBeLessThan(0.2); // ghost
        expect(strokes[1].globalAlpha).toBe(1); // ink

        // Ghost pass is stroke-only; the area fill belongs to the ink pass.
        expect(spy.countOf('clip')).toBe(1);
      });
    });

    describe('introAnimation: centerOutIntro()', () => {
      it('opens the clip window from the pane center outward with two heads', () => {
        const r = makeLine({ introAnimation: centerOutIntro() });
        r.setData(POINTS);
        renderFrame(r); // stamps the wave start

        advance(500);
        const { spy } = renderFrame(r);

        expect(spy.countOf('clip')).toBe(1);
        const [x, , w] = spy.callsOf('rect')[0].args as number[];
        // Window centered on the pane: opens from 400 outward.
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(400);
        expect(x + w).toBeGreaterThan(400);
        expect(x + w).toBeLessThan(800);

        // Two heads → at least 4 arcs (halo + core each).
        expect(spy.countOf('arc')).toBeGreaterThanOrEqual(4);
      });
    });
  });

  describe('PieRenderer', () => {
    const SLICES: PieSliceData[] = [
      { label: 'A', value: 25 },
      { label: 'B', value: 25 },
      { label: 'C', value: 25 },
      { label: 'D', value: 25 },
    ];

    function renderFrame(r: PieRenderer) {
      const built = buildRenderContext();
      r.render(built.ctx);

      return built;
    }

    it('unfurls clockwise — slice count grows with the sweep', () => {
      // Settled baseline: how many arcs a fully-revealed pie paints.
      const settled = new PieRenderer({ entryMs: 0 });
      settled.setData(SLICES);
      const settledArcs = renderFrame(settled).spy.countOf('arc');
      expect(settledArcs).toBeGreaterThan(0);

      const r = new PieRenderer();
      r.setData(SLICES);
      expect(r.needsAnimation).toBe(true);

      renderFrame(r); // stamps the wave; revealAngle still at 12 o'clock
      advance(300); // half of the default 600ms sweep
      const mid = renderFrame(r);
      const midArcs = mid.spy.countOf('arc');
      expect(midArcs).toBeGreaterThan(0);
      expect(midArcs).toBeLessThan(settledArcs);

      advance(301);
      const done = renderFrame(r);
      expect(done.spy.countOf('arc')).toBe(settledArcs);
    });

    it('chains the outside-label reveal after the slice sweep', () => {
      const r = new PieRenderer({ sliceLabels: { mode: 'outside' } });
      r.setData(SLICES);
      renderFrame(r);

      advance(300);
      const mid = renderFrame(r);
      // Labels hold at reveal 0 while the sweep runs — no text painted.
      expect(mid.spy.countOf('fillText')).toBe(0);

      advance(301);
      renderFrame(r);
      // Sweep done; the label reveal still has frames to produce.
      expect(r.needsAnimation).toBe(true);

      for (let i = 0; i < 60; i++) {
        advance(32);
        renderFrame(r);
      }
      const settled = renderFrame(r);
      expect(settled.spy.countOf('fillText')).toBeGreaterThan(0);
      expect(r.needsAnimation).toBe(false);
    });

    it('entryMs: 0 disables the sweep; re-seed does not replay', () => {
      const r = new PieRenderer({ entryMs: 0 });
      r.setData(SLICES);
      expect(r.needsAnimation).toBe(false);

      const { spy } = renderFrame(r);
      // One outer arc per slice at minimum — nothing held back by a sweep.
      expect(spy.countOf('arc')).toBeGreaterThanOrEqual(SLICES.length);

      const armed = new PieRenderer();
      armed.setData(SLICES);
      renderFrame(armed);
      advance(1000);
      renderFrame(armed);
      armed.setData(SLICES);
      expect(armed.needsAnimation).toBe(false);
    });
  });
});
