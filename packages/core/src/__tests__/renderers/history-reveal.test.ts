import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TimeSeriesStore } from '../../data/store';
import { BarRenderer } from '../../series/bar';
import { CandlestickRenderer } from '../../series/candlestick';
import { LineRenderer } from '../../series/line';
import type { CandlestickSeriesOptions, OHLCData, TimePoint } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

/**
 * History-prepend reveal — the boundary-anchored wave that plays when older
 * points land at the front of a series (the EdgeLoader load-more path),
 * replacing the old "prepended points pop in fully formed" behavior.
 *
 * The global test setup reports `prefers-reduced-motion: reduce`, which
 * disables the reveal entirely; this suite swaps in a motion-allowing
 * `matchMedia` like the intro-animation suite does.
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

const OHLC = { open: 10, high: 12, low: 9, close: 11 };

/** Two old candles at t=60/80; two prepended at t=20/40 (boundary = 60). */
const INITIAL_CANDLES: OHLCData[] = [
  { time: 60, ...OHLC },
  { time: 80, ...OHLC },
];
const OLDER_CANDLES: OHLCData[] = [
  { time: 20, ...OHLC },
  { time: 40, ...OHLC },
];

const INITIAL_POINTS: TimePoint[] = [
  { time: 60, value: 5 },
  { time: 80, value: 8 },
];
const OLDER_POINTS: TimePoint[] = [
  { time: 20, value: 6 },
  { time: 40, value: 7 },
];

describe('history-prepend reveal', () => {
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

  function renderFrame(r: { render(ctx: unknown): void }) {
    const built = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 20 } });
    r.render(built.ctx);

    return built;
  }

  describe('CandlestickRenderer', () => {
    function makeCandle(options: Partial<CandlestickSeriesOptions> = {}): CandlestickRenderer {
      const store = new TimeSeriesStore<OHLCData>();
      store.setData(INITIAL_CANDLES);

      // introMs: 0 — keep the initial-load intro out of the way so alpha
      // reads below come from the history reveal alone.
      return new CandlestickRenderer(store, { cornerRadius: 0, introMs: false, ...options });
    }

    it('prepended candles fade in from the boundary while old candles stay at full alpha', () => {
      const r = makeCandle();
      r.prependPoints(OLDER_CANDLES);
      expect(r.needsAnimation).toBe(true);

      const { spy } = renderFrame(r);

      // 4 candles × (wick + body) = 8 fillRects. The two prepended candles
      // draw at reveal alpha (0 on the arming frame), the two old ones at 1.
      const rects = spy.callsOf('fillRect');
      expect(rects).toHaveLength(8);
      const faded = rects.filter((c) => c.globalAlpha < 1);
      const settled = rects.filter((c) => c.globalAlpha === 1);
      expect(faded).toHaveLength(4);
      expect(settled).toHaveLength(4);

      // The faded rects are the prepended candles — left of the boundary
      // (t=60 → x=480 of the 800px-wide 0..100 window).
      for (const rect of faded) {
        expect(rect.args[0] as number).toBeLessThan(480);
      }
    });

    it('the wave travels from the boundary into history: nearer candle reveals first', () => {
      const r = makeCandle();
      r.prependPoints(OLDER_CANDLES);
      renderFrame(r); // stamps the wave start

      advance(300);
      const { spy } = renderFrame(r);

      // t=40 sits at stagger position 0.5 (mid-span), t=20 at 1.0 (deepest).
      // At 300ms of a 400ms-per-element wave the mid candle is fading in
      // while the deepest is still waiting.
      const rects = spy.callsOf('fillRect');
      const alphaAt = (xMax: number, xMin: number) => {
        const hit = rects.find((c) => (c.args[0] as number) >= xMin && (c.args[0] as number) < xMax);
        expect(hit).toBeDefined();

        return hit ? hit.globalAlpha : Number.NaN;
      };
      const deepAlpha = alphaAt(240, 0); // candle at t=20 → x≈160
      const nearAlpha = alphaAt(400, 240); // candle at t=40 → x≈320

      expect(deepAlpha).toBe(0);
      expect(nearAlpha).toBeGreaterThan(0);
    });

    it('settles at full alpha once the reveal window elapses', () => {
      const r = makeCandle();
      r.prependPoints(OLDER_CANDLES);
      renderFrame(r);

      advance(2000);
      const { spy } = renderFrame(r);

      expect(r.needsAnimation).toBe(false);
      for (const rect of spy.callsOf('fillRect')) {
        expect(rect.globalAlpha).toBe(1);
      }
    });

    it("historyReveal: 'none' draws prepended candles instantly at full alpha", () => {
      const r = makeCandle({ historyReveal: 'none' });
      r.prependPoints(OLDER_CANDLES);
      expect(r.needsAnimation).toBe(false);

      const { spy } = renderFrame(r);

      expect(spy.callsOf('fillRect')).toHaveLength(8);
      for (const rect of spy.callsOf('fillRect')) {
        expect(rect.globalAlpha).toBe(1);
      }
    });

    it('historyRevealMs: 0 disables the reveal', () => {
      const r = makeCandle({ historyRevealMs: false });
      r.prependPoints(OLDER_CANDLES);

      expect(r.needsAnimation).toBe(false);
    });
  });

  describe('BarRenderer', () => {
    function makeBar(): BarRenderer {
      const r = new BarRenderer(1, { cornerRadius: 0, introMs: false });
      r.setData(INITIAL_POINTS);

      return r;
    }

    it('prepended bars fade in while old bars stay at full alpha', () => {
      const r = makeBar();
      r.prependPoints(OLDER_POINTS, 0);
      expect(r.needsAnimation).toBe(true);

      const { spy } = renderFrame(r);

      const rects = spy.callsOf('fillRect');
      expect(rects).toHaveLength(4);
      expect(rects.filter((c) => c.globalAlpha < 1)).toHaveLength(2);
      expect(rects.filter((c) => c.globalAlpha === 1)).toHaveLength(2);
    });

    it('settles at full alpha once the reveal window elapses', () => {
      const r = makeBar();
      r.prependPoints(OLDER_POINTS, 0);
      renderFrame(r);

      advance(2000);
      const { spy } = renderFrame(r);

      expect(r.needsAnimation).toBe(false);
      for (const rect of spy.callsOf('fillRect')) {
        expect(rect.globalAlpha).toBe(1);
      }
    });
  });

  describe('LineRenderer', () => {
    function makeLine(): LineRenderer {
      const r = new LineRenderer(1, { introMs: false, pulse: false });
      r.setData(INITIAL_POINTS);

      return r;
    }

    it('back-fills behind a clip front anchored at the boundary', () => {
      const r = makeLine();
      r.prependPoints(OLDER_POINTS, 0);

      const first = renderFrame(r);
      // The default backfillSweepIntro clips the main pass: two rects (the
      // revealed history slice + everything right of the boundary).
      expect(first.spy.countOf('clip')).toBe(1);
      expect(first.spy.countOf('rect')).toBe(2);

      // The revealed slice's left edge advances into history as the front
      // travels (bitmap x decreases).
      const leftEdgeAt = (spy: (typeof first)['spy']) => spy.callsOf('rect')[0].args[0] as number;
      const startEdge = leftEdgeAt(first.spy);

      advance(400);
      const mid = renderFrame(r);
      expect(leftEdgeAt(mid.spy)).toBeLessThan(startEdge);
    });

    it('drops the clip once the reveal settles', () => {
      const r = makeLine();
      r.prependPoints(OLDER_POINTS, 0);
      renderFrame(r);

      advance(2000);
      const settled = renderFrame(r);

      expect(r.needsAnimation).toBe(false);
      expect(settled.spy.countOf('clip')).toBe(0);
    });
  });
});
