import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LineRenderer } from '../../series/line';
import type { TimePoint } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

function seed(n: number, offset = 0, scale = 1): TimePoint[] {
  return Array.from({ length: n }, (_, i) => ({ time: i * 10 + 5, value: offset + i * scale }));
}

describe('LineRenderer point markers', () => {
  it('points hidden by default — main render draws no arcs', () => {
    const r = new LineRenderer(1, { area: { visible: false } });
    r.setData(seed(5), 0);
    const { ctx, spy } = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 10 } });
    r.render(ctx);

    expect(spy.countOf('arc')).toBe(0);
  });

  it('points.visible → one arc per data point, filled with the layer color', () => {
    const r = new LineRenderer(1, { area: { visible: false }, colors: ['#abcdef'], points: { visible: true } });
    r.setData(seed(5), 0);
    const { ctx, spy } = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 10 } });
    r.render(ctx);

    expect(spy.countOf('arc')).toBe(5);
    const fills = spy.callsOf('fill');
    expect(fills.some((c) => c.fillStyle === '#abcdef')).toBe(true);
  });

  it('dots land on the line vertices (real scale coordinates)', () => {
    const r = new LineRenderer(1, { area: { visible: false }, points: { visible: true } });
    r.setData(seed(3), 0);
    const { ctx, spy, timeScale, yScale } = buildRenderContext({
      timeRange: { from: 0, to: 100 },
      yRange: { min: 0, max: 10 },
    });
    r.render(ctx);

    const arcs = spy.callsOf('arc');
    expect(arcs[0]?.args[0]).toBeCloseTo(timeScale.timeToBitmapX(5));
    expect(arcs[0]?.args[1]).toBeCloseTo(yScale.valueToBitmapY(0));
  });

  it('points.radius scales the arc radius (CSS px × pixel ratio)', () => {
    const r = new LineRenderer(1, { area: { visible: false }, points: { visible: true, radius: 5 } });
    r.setData(seed(3), 0);
    const { ctx, spy } = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 10 } });
    r.render(ctx);

    for (const arc of spy.callsOf('arc')) {
      expect(arc.args[2]).toBe(5);
    }
  });

  it('points.color overrides the layer color for the dot fill only', () => {
    const r = new LineRenderer(1, {
      area: { visible: false },
      colors: ['#111111'],
      points: { visible: true, color: '#ff8800' },
    });
    r.setData(seed(3), 0);
    const { ctx, spy } = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 10 } });
    r.render(ctx);

    expect(spy.callsOf('stroke')[0]?.strokeStyle).toBe('#111111');
    expect(spy.callsOf('fill').some((c) => c.fillStyle === '#ff8800')).toBe(true);
  });

  it('density guard: dots too dense to read as markers are skipped for the frame', () => {
    // 400 points across an 800px canvas → ~2px spacing, far under the
    // ~1.5-diameter threshold for the default 3px radius.
    const r = new LineRenderer(1, { area: { visible: false }, points: { visible: true } });
    r.setData(seed(400), 0);
    const { ctx, spy } = buildRenderContext({ timeRange: { from: 0, to: 4000 }, yRange: { min: 0, max: 400 } });
    r.render(ctx);

    expect(spy.countOf('arc')).toBe(0);
    expect(spy.countOf('stroke')).toBe(1); // the line itself still draws
  });

  it('non-finite values: dots only at finite points, no NaN coordinates', () => {
    const r = new LineRenderer(1, { area: { visible: false }, points: { visible: true } });
    r.setData(
      [
        { time: 10, value: 1 },
        { time: 20, value: 2 },
        { time: 30, value: Number.NaN },
        { time: 40, value: 3 },
        { time: 50, value: 4 },
      ],
      0,
    );
    const { ctx, spy } = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 10 } });
    expect(() => r.render(ctx)).not.toThrow();

    // 4 finite points → 4 marker arcs (the NaN slot draws nothing).
    expect(spy.countOf('arc')).toBe(4);
    for (const call of spy.calls) {
      for (const arg of call.args) {
        if (typeof arg === 'number') expect(Number.isFinite(arg)).toBe(true);
      }
    }
  });

  it('stacked: each visible layer draws dots on its upper edge in its own color', () => {
    const r = new LineRenderer(2, {
      stacking: 'normal',
      area: { visible: false },
      colors: ['#aaa', '#bbb'],
      points: { visible: true },
    });
    r.setData(seed(3, 0, 1), 0);
    r.setData(seed(3, 0, 1), 1);
    const { ctx, spy } = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 10 } });
    r.render(ctx);

    // 3 vertices per layer × 2 layers.
    expect(spy.countOf('arc')).toBe(6);
    const dotFills = spy.callsOf('fill').map((c) => c.fillStyle);
    expect(dotFills).toContain('#aaa');
    expect(dotFills).toContain('#bbb');
  });

  it('hidden layer draws no dots', () => {
    const r = new LineRenderer(2, {
      area: { visible: false },
      stacking: 'off',
      colors: ['#111', '#222'],
      points: { visible: true },
    });
    r.setData(seed(3), 0);
    r.setData(seed(3, 10), 1);
    r.setLayerVisible(1, false);
    r.setLayerAlpha(1, 0, 0);
    const { ctx, spy } = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 20 } });
    r.render(ctx);

    expect(spy.countOf('arc')).toBe(3); // only layer 0's points
  });

  describe('stacked, mid-fade', () => {
    let now = 0;

    beforeEach(() => {
      now = 1000;
      vi.spyOn(performance, 'now').mockImplementation(() => now);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("fading layer's dots are drawn with globalAlpha scaled by layerAlpha", () => {
      const r = new LineRenderer(2, {
        colors: ['#00aa00', '#0000aa'],
        stacking: 'normal',
        entryAnimation: 'none',
        area: { visible: false },
        points: { visible: true },
      });
      r.setData(seed(3, 10), 0);
      r.setData(seed(3, 5), 1);

      r.setLayerAlpha(1, 0, 250);
      now += 125;

      const { ctx, spy } = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 20 } });
      r.render(ctx);

      const alpha = r.getLayerAlpha(1);
      expect(alpha).toBeLessThan(1);
      expect(alpha).toBeGreaterThan(0);

      const fadingDotFill = spy.callsOf('fill').find((c) => c.fillStyle === '#0000aa');
      expect(fadingDotFill).toBeDefined();
      expect(fadingDotFill?.globalAlpha).toBeCloseTo(alpha, 3);
    });
  });
});
