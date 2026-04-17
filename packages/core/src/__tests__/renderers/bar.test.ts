import { describe, expect, it } from 'vitest';

import { BarRenderer } from '../../series/bar';
import type { TimePoint } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

function ts(n: number, seed: (i: number) => number): TimePoint[] {
  return Array.from({ length: n }, (_, i) => ({ time: i * 10 + 5, value: seed(i) }));
}

describe('BarRenderer.render', () => {
  it('empty stores → zero draw calls', () => {
    const r = new BarRenderer(1);
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);
    expect(spy.calls).toHaveLength(0);
  });

  it('single-layer positive values: one fillRect per bar with the positive color', () => {
    const r = new BarRenderer(1, { colors: ['#00aa00', '#aa0000'], stacking: 'off' });
    r.setData(ts(4, (i) => i + 1));
    const { ctx, spy } = buildRenderContext({ yRange: { min: 0, max: 10 } });
    r.render(ctx);

    expect(spy.countOf('fillRect')).toBe(4);
    for (const c of spy.callsOf('fillRect')) {
      expect(c.fillStyle).toBe('#00aa00');
    }
  });

  it('single-layer with negative values uses colors[1], draws a zero line, and heights go downward', () => {
    const r = new BarRenderer(1, { colors: ['#00aa00', '#aa0000'], stacking: 'off' });
    r.setData([
      { time: 10, value: 3 },
      { time: 30, value: -2 },
      { time: 50, value: 5 },
    ]);
    const { ctx, spy } = buildRenderContext({ yRange: { min: -5, max: 10 } });
    r.render(ctx);

    const fills = spy.callsOf('fillRect');
    expect(fills).toHaveLength(3);
    const negativeFill = fills.find((c) => c.fillStyle === '#aa0000');
    expect(negativeFill).toBeDefined();
    // Zero line drawn as a stroke segment.
    expect(spy.matchesSequence(['beginPath', 'moveTo', 'lineTo', 'stroke'])).toBe(true);
  });

  it('bar width respects barWidthRatio (smaller ratio → smaller bars)', () => {
    const wide = new BarRenderer(1, { colors: ['#000'], barWidthRatio: 0.9, stacking: 'off' });
    const narrow = new BarRenderer(1, { colors: ['#000'], barWidthRatio: 0.2, stacking: 'off' });
    wide.setData(ts(3, () => 5));
    narrow.setData(ts(3, () => 5));

    const opts = { yRange: { min: 0, max: 10 }, dataInterval: 10 };
    const a = buildRenderContext(opts);
    const b = buildRenderContext(opts);
    wide.render(a.ctx);
    narrow.render(b.ctx);

    const wideW = a.spy.callsOf('fillRect')[0].args[2] as number;
    const narrowW = b.spy.callsOf('fillRect')[0].args[2] as number;
    expect(wideW).toBeGreaterThan(narrowW);
  });

  it('multi-layer stacking=off: all layers overlap at the same X, tallest first', () => {
    const r = new BarRenderer(2, { colors: ['#111', '#222'], stacking: 'off' });
    r.setData([{ time: 50, value: 10 }], 0);
    r.setData([{ time: 50, value: 3 }], 1);
    const { ctx, spy } = buildRenderContext({ yRange: { min: 0, max: 15 } });
    r.render(ctx);

    const fills = spy.callsOf('fillRect');
    expect(fills).toHaveLength(2);
    // Tallest drawn first (behind).
    expect(fills[0].fillStyle).toBe('#111');
    expect(fills[1].fillStyle).toBe('#222');
    // Both share the same X position (overlap, not side-by-side).
    expect(fills[0].args[0]).toBe(fills[1].args[0]);
  });

  it('multi-layer stacking=normal: layers drawn bottom-to-top with cumulative Y offsets', () => {
    const r = new BarRenderer(2, { colors: ['#111', '#222'], stacking: 'normal' });
    r.setData([{ time: 50, value: 4 }], 0);
    r.setData([{ time: 50, value: 6 }], 1);
    const { ctx, spy } = buildRenderContext({ yRange: { min: 0, max: 20 } });
    r.render(ctx);

    const fills = spy.callsOf('fillRect');
    expect(fills).toHaveLength(2);
    // Bottom layer drawn first (rendering order = bottom-to-top).
    expect(fills[0].fillStyle).toBe('#111');
    // Top layer (y) is strictly higher (smaller Y value) because it sits on top of the first.
    const bottomY = fills[0].args[1] as number;
    const topY = fills[1].args[1] as number;
    expect(topY).toBeLessThan(bottomY);
  });

  it('hidden layer skipped in multi-layer off (still draws the visible one)', () => {
    const r = new BarRenderer(2, { colors: ['#111', '#222'], stacking: 'off' });
    r.setData([{ time: 50, value: 5 }], 0);
    r.setData([{ time: 50, value: 8 }], 1);
    r.setLayerVisible(1, false);
    const { ctx, spy } = buildRenderContext({ yRange: { min: 0, max: 10 } });
    r.render(ctx);

    const fills = spy.callsOf('fillRect');
    expect(fills).toHaveLength(1);
    expect(fills[0].fillStyle).toBe('#111');
  });

  it('stacking=percent: getValueRange returns fixed [0, 100]', () => {
    const r = new BarRenderer(2, { stacking: 'percent' });
    r.setData([{ time: 1, value: 2 }], 0);
    r.setData([{ time: 1, value: 3 }], 1);
    expect(r.getValueRange(0, 100)).toEqual({ min: 0, max: 100 });
  });
});
