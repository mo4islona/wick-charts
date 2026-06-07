import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LineRenderer } from '../../series/line';
import type { TimePoint } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

const VIEW = { timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 70 } } as const;

describe('LineRenderer — smooth + decimation / grow', () => {
  it('renders a smooth line over a decimated point set without throwing (#20)', () => {
    // > pixelWidth*2 (800*2) points → decimation kicks in.
    const data: TimePoint[] = Array.from({ length: 2000 }, (_, i) => ({
      time: i,
      value: 35 + 30 * Math.sin(i / 9),
    }));
    const r = new LineRenderer(1, { area: { visible: true }, curve: 'smooth' });
    r.setData(data, 0);
    const { ctx, spy } = buildRenderContext({ timeRange: { from: 0, to: 2000 }, yRange: { min: 0, max: 70 } });

    expect(() => r.render(ctx)).not.toThrow();
    expect(spy.countOf('bezierCurveTo')).toBeGreaterThan(0);
    for (const call of spy.calls) {
      for (const arg of call.args) {
        if (typeof arg === 'number') expect(Number.isFinite(arg)).toBe(true);
      }
    }
  });

  describe('smooth + grow (no moving-head wobble) (#20a)', () => {
    let now = 0;
    beforeEach(() => {
      now = 1000;
      vi.spyOn(performance, 'now').mockImplementation(() => now);
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('keeps the in-flight final segment a straight lineTo while the settled prefix is bezier-fit', () => {
      const r = new LineRenderer(1, { area: { visible: false }, curve: 'smooth', entryMs: 250 });
      r.setData(
        [
          { time: 5, value: 10 },
          { time: 15, value: 40 },
          { time: 25, value: 20 },
        ],
        0,
      );
      // Append a 4th point and render mid-entrance (progress < 1) so the trailing
      // endpoint is still gliding.
      r.appendPoint({ time: 35, value: 55 });
      now += 80; // 80/250 ≈ 0.32 progress
      const { ctx, spy } = buildRenderContext(VIEW);
      r.render(ctx);

      const strokeIdx = spy.calls.findIndex((c) => c.method === 'stroke');
      expect(strokeIdx).toBeGreaterThanOrEqual(0);

      // The settled prefix curves; the moving final segment degrades to a lineTo.
      const pathCalls = spy.calls
        .slice(0, strokeIdx)
        .filter((c) => c.method === 'bezierCurveTo' || c.method === 'lineTo');
      expect(pathCalls.length).toBeGreaterThanOrEqual(2);
      expect(pathCalls.at(-1)?.method).toBe('lineTo'); // in-flight tail is straight
      expect(pathCalls.some((c) => c.method === 'bezierCurveTo')).toBe(true); // settled prefix curved
    });
  });
});
