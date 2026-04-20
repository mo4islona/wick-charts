import { describe, expect, it } from 'vitest';

import { LineRenderer } from '../../series/line';
import type { TimePoint } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

function seed(n: number, offset = 0, scale = 1): TimePoint[] {
  return Array.from({ length: n }, (_, i) => ({ time: i * 10 + 5, value: offset + i * scale }));
}

describe('LineRenderer.render', () => {
  it('empty stores → zero draw calls', () => {
    const r = new LineRenderer(2);
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);
    expect(spy.calls).toHaveLength(0);
  });

  it('single-layer: beginPath → moveTo → (N-1) lineTo → stroke', () => {
    const r = new LineRenderer(1, { area: { visible: false } });
    r.setData(seed(5), 0);
    const { ctx, spy } = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 10 } });
    r.render(ctx);

    expect(spy.matchesSequence(['beginPath', 'moveTo', 'lineTo', 'lineTo', 'lineTo', 'lineTo', 'stroke'])).toBe(true);
    expect(spy.countOf('moveTo')).toBe(1);
    expect(spy.countOf('lineTo')).toBe(4); // N-1 lineTos for N=5 points
    expect(spy.countOf('stroke')).toBe(1);
  });

  it('stroke color matches the layer color', () => {
    const r = new LineRenderer(1, { area: { visible: false }, colors: ['#abcdef'] });
    r.setData(seed(3), 0);
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);

    const stroke = spy.callsOf('stroke')[0];
    expect(stroke?.strokeStyle).toBe('#abcdef');
  });

  it('multi-layer stacking=off: one beginPath per visible layer, distinct colors', () => {
    const r = new LineRenderer(3, { area: { visible: false }, stacking: 'off', colors: ['#111', '#222', '#333'] });
    r.setData(seed(3), 0);
    r.setData(seed(3, 10), 1);
    r.setData(seed(3, 20), 2);
    const { ctx, spy } = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 30 } });
    r.render(ctx);

    expect(spy.countOf('beginPath')).toBe(3);
    expect(spy.countOf('stroke')).toBe(3);
    const strokeColors = spy.callsOf('stroke').map((c) => c.strokeStyle);
    expect(strokeColors).toEqual(['#111', '#222', '#333']);
  });

  it('area: { visible: true } → each layer also calls fill() with a gradient fillStyle', () => {
    const r = new LineRenderer(1, { area: { visible: true }, colors: ['#00f'] });
    r.setData(seed(4), 0);
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);

    expect(spy.countOf('fill')).toBe(1);
    const fill = spy.callsOf('fill')[0];
    expect(fill?.fillStyle).toContain('gradient(linear');
  });

  it('hidden layer is skipped (no beginPath/stroke for it)', () => {
    const r = new LineRenderer(2, { area: { visible: false }, stacking: 'off', colors: ['#111', '#222'] });
    r.setData(seed(3), 0);
    r.setData(seed(3, 10), 1);
    r.setLayerVisible(1, false);
    const { ctx, spy } = buildRenderContext({ yRange: { min: 0, max: 20 } });
    r.render(ctx);

    expect(spy.countOf('stroke')).toBe(1);
    expect(spy.callsOf('stroke')[0]?.strokeStyle).toBe('#111');
  });

  it('fewer than 2 points → layer is skipped (cannot draw a line)', () => {
    const r = new LineRenderer(2, { area: { visible: false }, stacking: 'off' });
    r.setData([{ time: 5, value: 1 }], 0); // single point
    r.setData(seed(3), 1);
    const { ctx, spy } = buildRenderContext();
    r.render(ctx);

    expect(spy.countOf('stroke')).toBe(1); // only layer 1 drew
  });

  it('stacking=normal: each visible layer draws a stroked edge (top-down order)', () => {
    const r = new LineRenderer(2, {
      stacking: 'normal',
      area: { visible: false },
      colors: ['#aaa', '#bbb'],
    });
    r.setData(seed(3, 0, 1), 0);
    r.setData(seed(3, 0, 1), 1);
    const { ctx, spy } = buildRenderContext({ yRange: { min: 0, max: 10 } });
    r.render(ctx);

    expect(spy.countOf('stroke')).toBe(2);
    // Upper layer drawn first (top-down).
    expect(spy.callsOf('stroke').map((c) => c.strokeStyle)).toEqual(['#bbb', '#aaa']);
  });

  it('stacking=percent: getValueRange returns fixed [0, 100]', () => {
    const r = new LineRenderer(2, { stacking: 'percent' });
    r.setData([{ time: 1, value: 2 }], 0);
    r.setData([{ time: 1, value: 8 }], 1);
    expect(r.getValueRange(0, 100)).toEqual({ min: 0, max: 100 });
  });

  it('mixed Date/number input normalizes through setData (regression #4)', () => {
    const r = new LineRenderer(1, { area: { visible: false } });
    r.setData([
      { time: 10, value: 1 },
      { time: new Date(30), value: 2 }, // Date in the middle
      { time: 50, value: 3 },
    ]);
    const { ctx, spy } = buildRenderContext({ yRange: { min: 0, max: 10 } });
    r.render(ctx);

    // All moveTo/lineTo calls should have finite x coordinates.
    const pathCalls = spy.calls.filter((c) => c.method === 'moveTo' || c.method === 'lineTo');
    for (const call of pathCalls) {
      expect(Number.isFinite(call.args[0] as number)).toBe(true);
    }
  });
});

describe('LineRenderer.drawOverlay', () => {
  it('pulse dots: each visible layer with data draws a glow + dot arc on the overlay', () => {
    const r = new LineRenderer(2, { area: { visible: false }, pulse: true, colors: ['#111', '#222'] });
    r.setData(seed(3), 0);
    r.setData(seed(3, 10), 1);
    const { overlayCtx, spy } = buildRenderContext({ yRange: { min: 0, max: 20 } });
    r.drawOverlay(overlayCtx(null));

    // Each visible layer draws 2 arcs (outer glow + inner dot) — 4 total for 2 layers.
    expect(spy.countOf('arc')).toBe(4);
  });

  it('crosshair present → extra arcs for nearest-point markers', () => {
    const r = new LineRenderer(1, { area: { visible: false }, pulse: false, colors: ['#111'] });
    r.setData(seed(5), 0);
    const { overlayCtx, spy } = buildRenderContext({ yRange: { min: 0, max: 10 } });
    r.drawOverlay(overlayCtx({ mediaX: 50, mediaY: 100, time: 25, y: 2 }));

    // Crosshair contributes 2 arcs (glow + dot) per visible layer.
    expect(spy.countOf('arc')).toBeGreaterThanOrEqual(2);
  });
});
