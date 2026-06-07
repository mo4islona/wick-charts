import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BarRenderer } from '../../series/bar';
import type { BarPaintArgs, BarPainter } from '../../series/painters/types';
import { buildRenderContext } from '../helpers/render-context';

const WIDE = { yRange: { min: 0, max: 100 }, dataInterval: 25 } as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BarRenderer — custom painter', () => {
  it('invokes a raw painter once per bar with engine-decided geometry, corners, radius', () => {
    const calls: BarPaintArgs[] = [];
    const painter: BarPainter = (_env, args) => {
      calls.push(args);
    };
    // Explicit cornerRadius so the test is independent of the (tunable) default.
    const r = new BarRenderer(1, { colors: ['#abcdef'], barPainter: painter, cornerRadius: 4 });
    r.setData([
      { time: 25, value: 60 },
      { time: 50, value: 80 },
    ]);
    const { ctx } = buildRenderContext(WIDE);
    r.render(ctx);

    expect(calls).toHaveLength(2);
    for (const args of calls) {
      expect(args.color).toBe('#abcdef');
      // Positive bars round the top — the renderer decided this, not the painter.
      expect(args.corners).toEqual({ tl: true, tr: true, br: false, bl: false });
      expect(args.radius).toBeCloseTo(4); // 4 CSS px × pixelRatio 1
      expect(args.isProjected).toBe(false);
      expect(args.geom.width).toBeGreaterThan(0);
      expect(args.geom.height).toBeGreaterThan(0);
    }
  });

  it('flags projected bars to the painter', () => {
    const projected: boolean[] = [];
    const painter: BarPainter = (_env, args) => {
      projected.push(args.isProjected);
    };
    const r = new BarRenderer(1, { colors: ['#abcdef'], barPainter: painter, projectedFrom: 60 });
    r.setData([
      { time: 25, value: 50 },
      { time: 75, value: 50 },
    ]);
    const { ctx } = buildRenderContext(WIDE);
    r.render(ctx);

    expect(projected).toEqual([false, true]);
  });

  it('flags a bar whose time === projectedFrom (inclusive cut)', () => {
    const projected: boolean[] = [];
    const painter: BarPainter = (_env, args) => {
      projected.push(args.isProjected);
    };
    const r = new BarRenderer(1, { colors: ['#abcdef'], barPainter: painter, projectedFrom: 50 });
    r.setData([
      { time: 25, value: 50 },
      { time: 50, value: 50 }, // == projectedFrom → projected (>= is inclusive)
      { time: 75, value: 50 },
    ]);
    const { ctx } = buildRenderContext(WIDE);
    r.render(ctx);

    // A `>` regression at the cut would flip the middle bar to false.
    expect(projected).toEqual([false, true, true]);
  });

  it('scales the corner radius by the HORIZONTAL pixel ratio (matches the candlestick renderer)', () => {
    const seen: BarPaintArgs[] = [];
    const painter: BarPainter = (_env, args) => {
      seen.push(args);
    };
    const r = new BarRenderer(1, { colors: ['#abcdef'], barPainter: painter, cornerRadius: 4 });
    r.setData([{ time: 50, value: 80 }]); // tall bar so the per-bar clamp won't engage
    const { ctx } = buildRenderContext({ ...WIDE, horizontalPixelRatio: 3, verticalPixelRatio: 1 });
    r.render(ctx);

    expect(seen).toHaveLength(1);
    // 4 CSS px × hpr(3) = 12; it would be 4 if the radius (wrongly) used vpr(1).
    expect(seen[0].radius).toBeCloseTo(12, 5);
  });
});

describe('BarRenderer — projected bar through the entrance transform (§7.1 single alpha source)', () => {
  let now = 0;
  beforeEach(() => {
    now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a projected bar appended mid-entrance fills at globalAlpha 1 — translucency is the only fade', () => {
    const r = new BarRenderer(1, { colors: ['#8250df'], projectedFrom: 60, entryMs: 250 });
    r.setData([
      { time: 25, value: 50 },
      { time: 50, value: 50 },
    ]);
    // The newest bar is BOTH projected and freshly entering — exactly the case
    // the force-to-1 guards. Without it, the ghost would also take a globalAlpha
    // fade (double-fade settle-pop).
    r.appendPoint({ time: 75, value: 50 });
    now += 100; // a normal bar would be at progress 0.4 here
    const { ctx, spy } = buildRenderContext(WIDE);
    r.render(ctx);

    const ghost = spy.callsOf('fill').filter((f) => String(f.fillStyle).includes('rgba'));
    expect(ghost).toHaveLength(1);
    expect(ghost[0].globalAlpha).toBe(1);
  });

  it('forces args.progress to 1 for a projected bar even mid-entrance', () => {
    const seen: { isProjected: boolean; progress: number }[] = [];
    const painter: BarPainter = (_env, args) => {
      seen.push({ isProjected: args.isProjected, progress: args.progress });
    };
    const r = new BarRenderer(1, { colors: ['#abcdef'], barPainter: painter, projectedFrom: 60, entryMs: 250 });
    r.setData([{ time: 25, value: 50 }]);
    r.appendPoint({ time: 75, value: 50 });
    now += 100;
    const { ctx } = buildRenderContext(WIDE);
    r.render(ctx);

    const projected = seen.find((s) => s.isProjected);
    expect(projected?.progress).toBe(1);
  });

  it('a throwing RAW inline painter does not abort the frame — it falls back to the default fill', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const boom: BarPainter = () => {
      throw new Error('boom');
    };
    const r = new BarRenderer(1, { colors: ['#8250df'], barPainter: boom });
    r.setData([{ time: 50, value: 60 }]);
    const { ctx, spy } = buildRenderContext(WIDE);

    expect(() => r.render(ctx)).not.toThrow();
    r.render(ctx);

    // The default rounded fill rescued the paint despite the inline painter throwing...
    expect(spy.countOf('arcTo')).toBeGreaterThan(0);
    // ...and the throw warned exactly once (WeakSet once-guard, stable across re-resolves).
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('clamps the radius handed to the painter to half the bar geometry (pre-clamped contract)', () => {
    const seen: BarPaintArgs[] = [];
    const painter: BarPainter = (_env, args) => {
      seen.push(args);
    };
    // A 6px-tall bar (value 1.5 over [0,100] @ 400px): half-height (3) is below
    // the explicit 4px radius, so the contract clamp must engage before the
    // painter. Explicit cornerRadius keeps this independent of the default.
    const r = new BarRenderer(1, { colors: ['#abcdef'], barPainter: painter, cornerRadius: 4 });
    r.setData([{ time: 50, value: 1.5 }]);
    const { ctx } = buildRenderContext(WIDE);
    r.render(ctx);

    expect(seen).toHaveLength(1);
    const args = seen[0];
    expect(args.radius).toBeCloseTo(Math.min(4, args.geom.width / 2, args.geom.height / 2), 5);
    expect(args.radius).toBeLessThan(4); // a short bar → the clamp engaged
  });
});
