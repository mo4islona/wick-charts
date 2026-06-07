import { describe, expect, it } from 'vitest';

import { LineRenderer } from '../../series/line';
import type { TimePoint } from '../../types';
import { buildRenderContext } from '../helpers/render-context';

// Strictly-increasing time, non-monotonic value → smooth genuinely curves.
const YS = [10, 40, 20, 50, 30, 60];
function seed(n: number): TimePoint[] {
  return Array.from({ length: n }, (_, i) => ({ time: i * 10 + 5, value: YS[i % YS.length] }));
}

const VIEW = { timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 70 } } as const;

describe('LineRenderer — curve', () => {
  it("curve:'straight' strokes a polyline with no curves (#12)", () => {
    const r = new LineRenderer(1, { area: { visible: false }, curve: 'straight' });
    r.setData(seed(5), 0);
    const { ctx, spy } = buildRenderContext(VIEW);
    r.render(ctx);

    expect(spy.countOf('lineTo')).toBe(4); // N-1
    expect(spy.countOf('bezierCurveTo')).toBe(0);
  });

  it("curve:'smooth' strokes one bezier per segment (#13)", () => {
    const r = new LineRenderer(1, { area: { visible: false }, curve: 'smooth' });
    r.setData(seed(5), 0);
    const { ctx, spy } = buildRenderContext(VIEW);
    r.render(ctx);

    expect(spy.countOf('bezierCurveTo')).toBe(4); // N-1
    expect(spy.countOf('lineTo')).toBe(0);
  });

  it("curve:'stepped' emits strictly more lineTo than straight (#14)", () => {
    const straight = buildRenderContext(VIEW);
    const a = new LineRenderer(1, { area: { visible: false }, curve: 'straight' });
    a.setData(seed(5), 0);
    a.render(straight.ctx);

    const stepped = buildRenderContext(VIEW);
    const b = new LineRenderer(1, { area: { visible: false }, curve: 'stepped' });
    b.setData(seed(5), 0);
    b.render(stepped.ctx);

    expect(stepped.spy.countOf('lineTo')).toBe(8); // 2*(N-1)
    expect(stepped.spy.countOf('lineTo')).toBeGreaterThan(straight.spy.countOf('lineTo'));
  });

  it('stroke and area fill share the identical curved top edge (#15)', () => {
    const r = new LineRenderer(1, { area: { visible: true }, curve: 'smooth' });
    r.setData(seed(5), 0);
    const { ctx, spy } = buildRenderContext(VIEW);
    r.render(ctx);

    const strokeIdx = spy.calls.findIndex((c) => c.method === 'stroke');
    expect(strokeIdx).toBeGreaterThanOrEqual(0);

    const strokeBeziers = spy.calls.filter((c, i) => c.method === 'bezierCurveTo' && i < strokeIdx);
    const areaBeziers = spy.calls.filter((c, i) => c.method === 'bezierCurveTo' && i > strokeIdx);

    expect(strokeBeziers).toHaveLength(4);
    expect(areaBeziers).toHaveLength(strokeBeziers.length);
    // Same control points → the area's top edge IS the stroke curve.
    for (let k = 0; k < strokeBeziers.length; k++) {
      expect(areaBeziers[k].args).toEqual(strokeBeziers[k].args);
    }
    // The area still closes to the baseline.
    expect(spy.countOf('fill')).toBeGreaterThan(0);
  });

  it('a NaN gap splits smooth into separate runs — the curve never bridges it (#16)', () => {
    const data: TimePoint[] = [
      { time: 5, value: 10 },
      { time: 15, value: 40 },
      { time: 25, value: 20 }, // run 1
      { time: 35, value: Number.NaN }, // gap
      { time: 45, value: 50 },
      { time: 55, value: 30 },
      { time: 65, value: 60 }, // run 2 (with trailing)
    ];
    const r = new LineRenderer(1, { area: { visible: false }, curve: 'smooth' });
    r.setData(data, 0);
    const { ctx, spy } = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 70 } });
    r.render(ctx);

    // Two finite runs → two subpaths (two moveTo); no single curve spans the gap.
    expect(spy.countOf('moveTo')).toBe(2);
    expect(spy.countOf('bezierCurveTo')).toBeGreaterThan(0);
    for (const call of spy.calls) {
      for (const arg of call.args) {
        if (typeof arg === 'number') expect(Number.isFinite(arg)).toBe(true);
      }
    }
  });

  it.each([
    'straight',
    'smooth',
    'stepped',
  ] as const)("a NaN gap splits curve:'%s' into two runs — every curve, not just smooth (#16)", (curve) => {
    const data: TimePoint[] = [
      { time: 5, value: 10 },
      { time: 15, value: 40 },
      { time: 25, value: 20 }, // run 1
      { time: 35, value: Number.NaN }, // gap
      { time: 45, value: 50 },
      { time: 55, value: 30 },
      { time: 65, value: 60 }, // run 2
    ];
    const r = new LineRenderer(1, { area: { visible: false }, curve });
    r.setData(data, 0);
    const { ctx, spy } = buildRenderContext({ timeRange: { from: 0, to: 100 }, yRange: { min: 0, max: 70 } });
    r.render(ctx);

    // Two finite runs → two subpaths under every curve kind; nothing bridges
    // the gap and no coordinate is non-finite.
    expect(spy.countOf('moveTo')).toBe(2);
    for (const call of spy.calls) {
      for (const arg of call.args) {
        if (typeof arg === 'number') expect(Number.isFinite(arg)).toBe(true);
      }
    }
  });

  it('a raw linePainter overrides curve and is invoked per run', () => {
    let runs = 0;
    const r = new LineRenderer(1, {
      area: { visible: false },
      curve: 'smooth',
      linePainter: (env, args) => {
        runs++;
        env.ctx.moveTo(args.points[0].x, args.points[0].y);
        for (let i = 1; i < args.points.length; i++) {
          env.ctx.lineTo(args.points[i].x, args.points[i].y);
        }
      },
    });
    r.setData(seed(5), 0);
    const { ctx, spy } = buildRenderContext(VIEW);
    r.render(ctx);

    expect(runs).toBe(1);
    // The custom painter emitted straight lineTos, overriding curve:'smooth'.
    expect(spy.countOf('bezierCurveTo')).toBe(0);
    expect(spy.countOf('lineTo')).toBe(4);
  });
});
