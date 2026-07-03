import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TimeSeriesStore } from '../../data/store';
import { BarRenderer } from '../../series/bar';
import { CandlestickRenderer } from '../../series/candlestick';
import { LineRenderer } from '../../series/line';
import { type LineIntroFn, plotterIntro, traceIntro, unfoldIntro } from '../../series/line-intro';
import { PieRenderer } from '../../series/pie';
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

    it("waves left → right with 'fade': the left candle paints more opaque", () => {
      const r = makeCandle({ entryAnimation: 'fade' });
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

    it('clips to the reveal front mid-intro and draws the head glow', () => {
      const r = makeLine();
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
      const r = makeLine();
      r.setData(POINTS);
      renderFrame(r);

      advance(1001);
      const { spy } = renderFrame(r);

      expect(r.needsAnimation).toBe(false);
      expect(spy.countOf('clip')).toBe(0);
    });

    it('suppresses the pulse dot while the intro sweep runs', () => {
      const r = makeLine();
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
          const toTime = (x: number) => frame.range.from + (x / frame.width) * (frame.range.to - frame.range.from);

          return {
            clip: { fromX: cx - half, toX: cx + half },
            heads: [
              { x: cx - half, time: toTime(cx - half) },
              { x: cx + half, time: toTime(cx + half) },
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
