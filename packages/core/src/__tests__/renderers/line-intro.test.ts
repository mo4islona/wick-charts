import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LineRenderer } from '../../series/line';
import { type LineIntroFrame, traceIntro, unfoldIntro } from '../../series/line-intro';
import type { TimePoint } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

/**
 * Regression coverage for the line-intro fixes: the trace ghost pass staying
 * stroke-only in stacked mode, and the unfold stagger clamp. Same
 * motion-allowing `matchMedia` swap as the main intro suite — the global
 * test setup reports `prefers-reduced-motion: reduce`.
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

describe('line intro — regression fixes', () => {
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

  describe('traceIntro() on a stacked series', () => {
    const LAYER_A: TimePoint[] = [
      { time: 0, value: 2 },
      { time: 50, value: 4 },
      { time: 100, value: 3 },
    ];
    const LAYER_B: TimePoint[] = [
      { time: 0, value: 1 },
      { time: 50, value: 2 },
      { time: 100, value: 5 },
    ];

    it('ghost pre-pass is stroke-only — every area fill paints at full alpha', () => {
      const r = new LineRenderer(2, { stacking: 'normal', introAnimation: traceIntro() });
      r.setData(LAYER_A, 0);
      r.setData(LAYER_B, 1);

      const stamp = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 10 } });
      r.render(stamp.ctx);

      advance(400);
      const mid = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 10 } });
      r.render(mid.ctx);

      // Ghost strokes are present (translucent), but no `fill` rides the
      // ghost's reduced globalAlpha — the area belongs to the main pass.
      const strokes = mid.spy.callsOf('stroke');
      expect(strokes.some((c) => c.globalAlpha < 0.2)).toBe(true);
      const fills = mid.spy.callsOf('fill');
      expect(fills.length).toBeGreaterThan(0);
      for (const fill of fills) {
        expect(fill.globalAlpha).toBe(1);
      }
    });
  });

  describe('unfoldIntro() stagger clamp', () => {
    function makeFrame(progress: number): LineIntroFrame {
      return {
        progress,
        range: { from: 0, to: 100 },
        width: 800,
        height: 400,
        stacking: 'off',
        timeToX: (time) => time * 8,
        xToTime: (x) => x / 8,
        valueToY: (value) => 400 - value * 4,
        layerCount: 1,
        layerData: () => [],
        layerMean: () => 0,
        primaryPath: () => null,
      };
    }

    it('stagger: 1 still lands every point on its real value at full progress', () => {
      const intro = unfoldIntro({ stagger: 1 });
      const transform = intro(makeFrame(1)).value;
      expect(transform).toBeDefined();

      // Without the clamp the rightmost point would sit at its mean (0) for
      // the whole intro and snap to 10 on settle.
      const value = transform?.({ layerIndex: 0, time: 100, value: 10, position: 1 });
      expect(value).toBeCloseTo(10);
    });
  });
});
