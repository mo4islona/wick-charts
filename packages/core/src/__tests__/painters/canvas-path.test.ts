import { describe, expect, it } from 'vitest';

import { fillRoundedRect, tracePath } from '../../series/painters/canvas-path';
import type { CornerMask, LinePoint, PaintEnv } from '../../series/painters/types';
import { catppuccin } from '../../theme/themes/catppuccin';
import { createRecordingContext } from '../helpers/recording-context';

const ALL: CornerMask = { tl: true, tr: true, br: true, bl: true };
const TOP: CornerMask = { tl: true, tr: true, br: false, bl: false };
const NONE: CornerMask = { tl: false, tr: false, br: false, bl: false };

function makeEnv(ctx: CanvasRenderingContext2D): PaintEnv {
  return { ctx, theme: catppuccin.theme, horizontalPixelRatio: 1, verticalPixelRatio: 1 };
}

describe('fillRoundedRect', () => {
  it('rounds all four corners with arcTo and fills (no fillRect)', () => {
    const { ctx, spy } = createRecordingContext();

    fillRoundedRect(ctx, { x: 10, y: 20, width: 30, height: 40, radius: 6, corners: ALL });

    expect(spy.countOf('arcTo')).toBe(4);
    expect(spy.countOf('fill')).toBe(1);
    expect(spy.countOf('fillRect')).toBe(0);
  });

  it('rounds only masked corners — a top-only mask emits exactly two arcTo near the top edge', () => {
    const { ctx, spy } = createRecordingContext();

    fillRoundedRect(ctx, { x: 0, y: 100, width: 20, height: 60, radius: 5, corners: TOP });

    const arcs = spy.callsOf('arcTo');
    expect(arcs).toHaveLength(2);
    // Each arcTo's control point sits on the top edge (y === 100).
    for (const arc of arcs) {
      const [, y1] = arc.args as [number, number, number, number, number];
      expect(y1).toBe(100);
    }
  });

  it('clamps the radius to half the smaller dimension', () => {
    const { ctx, spy } = createRecordingContext();

    // radius 999 on a 20×8 rect → clamp to 4.
    fillRoundedRect(ctx, { x: 0, y: 0, width: 20, height: 8, radius: 999, corners: ALL });

    for (const arc of spy.callsOf('arcTo')) {
      const r = (arc.args as number[])[4];
      expect(r).toBeLessThanOrEqual(4);
    }
  });

  it('falls back to a plain fillRect when the radius is sub-pixel', () => {
    const { ctx, spy } = createRecordingContext();

    fillRoundedRect(ctx, { x: 1, y: 2, width: 10, height: 10, radius: 0.3, corners: ALL });

    expect(spy.countOf('fillRect')).toBe(1);
    expect(spy.countOf('arcTo')).toBe(0);
    expect(spy.callsOf('fillRect')[0].args).toEqual([1, 2, 10, 10]);
  });

  it('falls back to fillRect for a non-positive dimension (1px / collapsed bar)', () => {
    const { ctx, spy } = createRecordingContext();

    fillRoundedRect(ctx, { x: 0, y: 0, width: 12, height: 0, radius: 4, corners: ALL });

    expect(spy.countOf('fillRect')).toBe(1);
    expect(spy.countOf('arcTo')).toBe(0);
  });

  it('a square mask (no rounded corner) falls back to a plain fillRect', () => {
    const { ctx, spy } = createRecordingContext();

    fillRoundedRect(ctx, { x: 0, y: 0, width: 30, height: 30, radius: 6, corners: NONE });

    expect(spy.countOf('arcTo')).toBe(0);
    expect(spy.countOf('fill')).toBe(0);
    expect(spy.countOf('fillRect')).toBe(1);
  });

  it('never emits a non-finite path argument', () => {
    const { ctx, spy } = createRecordingContext();

    fillRoundedRect(ctx, { x: 5, y: 5, width: 24, height: 50, radius: 8, corners: TOP });

    for (const call of spy.calls) {
      for (const arg of call.args) {
        if (typeof arg === 'number') expect(Number.isFinite(arg)).toBe(true);
      }
    }
  });
});

describe('tracePath', () => {
  const line: LinePoint[] = [
    { x: 0, y: 40 },
    { x: 10, y: 10 },
    { x: 20, y: 12 },
    { x: 30, y: 60 },
  ];

  it('straight emits one lineTo per segment and no curves', () => {
    const { ctx, spy } = createRecordingContext();

    tracePath(makeEnv(ctx), { points: line, kind: 'straight', settledOnly: false });

    expect(spy.countOf('moveTo')).toBe(1);
    expect(spy.countOf('lineTo')).toBe(line.length - 1);
    expect(spy.countOf('bezierCurveTo')).toBe(0);
  });

  it('stepped emits two lineTo per segment (more than straight)', () => {
    const { ctx, spy } = createRecordingContext();

    tracePath(makeEnv(ctx), { points: line, kind: 'stepped', settledOnly: false });

    expect(spy.countOf('lineTo')).toBe((line.length - 1) * 2);
    expect(spy.countOf('bezierCurveTo')).toBe(0);
  });

  it('smooth emits one bezier per segment for a 3+ point run', () => {
    const { ctx, spy } = createRecordingContext();

    tracePath(makeEnv(ctx), { points: line, kind: 'smooth', settledOnly: false });

    expect(spy.countOf('bezierCurveTo')).toBe(line.length - 1);
    expect(spy.countOf('lineTo')).toBe(0);
  });

  it('smooth degrades a 2-point run to a single lineTo', () => {
    const { ctx, spy } = createRecordingContext();

    tracePath(makeEnv(ctx), { points: line.slice(0, 2), kind: 'smooth', settledOnly: false });

    expect(spy.countOf('lineTo')).toBe(1);
    expect(spy.countOf('bezierCurveTo')).toBe(0);
  });

  it('smooth + settledOnly keeps the final segment straight', () => {
    const { ctx, spy } = createRecordingContext();

    tracePath(makeEnv(ctx), { points: line, kind: 'smooth', settledOnly: true });

    expect(spy.countOf('bezierCurveTo')).toBe(line.length - 2);
    expect(spy.countOf('lineTo')).toBe(1);
  });

  it('smooth is monotone — the rendered curve never overshoots a segment value range', () => {
    const { ctx, spy } = createRecordingContext();

    tracePath(makeEnv(ctx), { points: line, kind: 'smooth', settledOnly: false });

    const beziers = spy.callsOf('bezierCurveTo');
    expect(beziers).toHaveLength(line.length - 1);

    // Cubic Bézier Y evaluated at parameter t — the real curve, not its hull.
    const evalY = (p0y: number, cp1y: number, cp2y: number, p1y: number, t: number): number => {
      const u = 1 - t;
      return u * u * u * p0y + 3 * u * u * t * cp1y + 3 * u * t * t * cp2y + t * t * t * p1y;
    };

    beziers.forEach((bez, k) => {
      const [, cp1y, , cp2y] = bez.args as [number, number, number, number, number, number];
      const p0 = line[k];
      const p1 = line[k + 1];
      const lo = Math.min(p0.y, p1.y) - 0.01;
      const hi = Math.max(p0.y, p1.y) + 0.01;
      for (let t = 0; t <= 1.0001; t += 0.1) {
        const y = evalY(p0.y, cp1y, cp2y, p1.y, t);
        expect(y).toBeGreaterThanOrEqual(lo);
        expect(y).toBeLessThanOrEqual(hi);
      }
    });
  });

  it('smooth degrades a non-increasing-x segment to a lineTo without throwing', () => {
    const { ctx, spy } = createRecordingContext();
    const withDup: LinePoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 20 }, // duplicate x — non-fittable segment
      { x: 20, y: 30 },
    ];

    expect(() => tracePath(makeEnv(ctx), { points: withDup, kind: 'smooth', settledOnly: false })).not.toThrow();
    expect(spy.countOf('lineTo')).toBeGreaterThanOrEqual(1);
    for (const call of spy.calls) {
      for (const arg of call.args) {
        if (typeof arg === 'number') expect(Number.isFinite(arg)).toBe(true);
      }
    }
  });
});
