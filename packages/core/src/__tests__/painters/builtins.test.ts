import { describe, expect, it } from 'vitest';

import {
  roundedBarFill,
  roundedCandleFill,
  smoothCurve,
  steppedCurve,
  straightCurve,
} from '../../series/painters/builtins';
import type { CornerMask, LinePoint, PaintEnv } from '../../series/painters/types';
import { catppuccin } from '../../theme/themes/catppuccin';
import { createRecordingContext } from '../helpers/recording-context';

const ALL: CornerMask = { tl: true, tr: true, br: true, bl: true };
const TOP: CornerMask = { tl: true, tr: true, br: false, bl: false };

function makeEnv(ctx: CanvasRenderingContext2D): PaintEnv {
  return { ctx, theme: catppuccin.theme, horizontalPixelRatio: 2, verticalPixelRatio: 2 };
}

const RUN: LinePoint[] = [
  { x: 0, y: 30 },
  { x: 10, y: 10 },
  { x: 20, y: 40 },
];

describe('line built-ins', () => {
  it('straightCurve emits lineTo, never bezier', () => {
    const { ctx, spy } = createRecordingContext();

    straightCurve(makeEnv(ctx), { points: RUN, color: '#fff', lineWidth: 2, closing: false, grew: false });

    expect(spy.countOf('lineTo')).toBeGreaterThan(0);
    expect(spy.countOf('bezierCurveTo')).toBe(0);
  });

  it('smoothCurve emits exactly one bezier per segment (no lineTo) for a settled run', () => {
    const { ctx, spy } = createRecordingContext();

    smoothCurve(makeEnv(ctx), { points: RUN, color: '#fff', lineWidth: 2, closing: false, grew: false });

    // A settled N-point run is N-1 beziers and zero straight segments — a
    // regression degrading one interior segment to a lineTo would still satisfy
    // a `> 0` check, so pin the exact shape.
    expect(spy.countOf('bezierCurveTo')).toBe(RUN.length - 1);
    expect(spy.countOf('lineTo')).toBe(0);
  });

  it('line painters only emit path commands — never beginPath / stroke / fill / closePath', () => {
    // The engine wraps the trace so the SAME path drives both the stroke and
    // the baseline-closed area fill; a painter that opened or closed its own
    // path would break that parity.
    const builders = { straightCurve, smoothCurve, steppedCurve };
    for (const [name, builder] of Object.entries(builders)) {
      const { ctx, spy } = createRecordingContext();

      builder(makeEnv(ctx), { points: RUN, color: '#fff', lineWidth: 2, closing: false, grew: false });

      expect(spy.countOf('beginPath'), name).toBe(0);
      expect(spy.countOf('closePath'), name).toBe(0);
      expect(spy.countOf('stroke'), name).toBe(0);
      expect(spy.countOf('fill'), name).toBe(0);
    }
  });

  it('smoothCurve keeps the head straight while growing', () => {
    const { ctx, spy } = createRecordingContext();

    smoothCurve(makeEnv(ctx), { points: RUN, color: '#fff', lineWidth: 2, closing: false, grew: true });

    // Last segment is a lineTo; only the settled prefix is curve-fit.
    expect(spy.countOf('lineTo')).toBe(1);
    expect(spy.countOf('bezierCurveTo')).toBe(RUN.length - 2);
  });

  it('steppedCurve emits strictly more lineTo than straight for the same run', () => {
    const straightSpy = createRecordingContext();
    straightCurve(makeEnv(straightSpy.ctx), { points: RUN, color: '#fff', lineWidth: 2, closing: false, grew: false });

    const steppedSpy = createRecordingContext();
    steppedCurve(makeEnv(steppedSpy.ctx), { points: RUN, color: '#fff', lineWidth: 2, closing: false, grew: false });

    expect(steppedSpy.spy.countOf('lineTo')).toBeGreaterThan(straightSpy.spy.countOf('lineTo'));
  });
});

describe('roundedBarFill', () => {
  const geom = { x: 10, y: 20, width: 24, height: 80, baselineY: 100 };

  it('fills a solid bar with the semantic color and never touches globalAlpha', () => {
    const { ctx, spy } = createRecordingContext();

    roundedBarFill(makeEnv(ctx), {
      geom,
      color: '#8250df',
      corners: TOP,
      radius: 6,
      progress: 1,
      isProjected: false,
    });

    const fill = spy.callsOf('fill').at(-1);
    expect(fill?.fillStyle).toBe('#8250df');
    expect(fill?.globalAlpha).toBe(1);
  });

  it('a projected bar fills translucent (rgba) without mutating globalAlpha', () => {
    const { ctx, spy } = createRecordingContext();

    roundedBarFill(makeEnv(ctx), {
      geom,
      color: '#8250df',
      corners: TOP,
      radius: 6,
      progress: 1,
      isProjected: true,
    });

    const fill = spy.callsOf('fill').at(-1);
    expect(fill?.fillStyle).toContain('rgba');
    expect(fill?.fillStyle).not.toBe('#8250df');
    expect(fill?.globalAlpha).toBe(1);
  });
});

describe('roundedCandleFill', () => {
  const geom = { x: 4, y: 8, width: 12, height: 40 };

  it('uses the engine-resolved gradient fillStyle and never rebuilds a gradient', () => {
    const { ctx, spy } = createRecordingContext();
    const grad = ctx.createLinearGradient(0, 8, 0, 48);
    grad.addColorStop(0, '#26a69a');
    grad.addColorStop(1, '#1b6e66');
    const beforeGradients = spy.countOf('createLinearGradient');

    roundedCandleFill(makeEnv(ctx), {
      geom,
      fillStyle: grad,
      color: '#26a69a',
      corners: ALL,
      radius: 3,
      progress: 1,
      isBullish: true,
    });

    // The painter builds zero additional gradients.
    expect(spy.countOf('createLinearGradient')).toBe(beforeGradients);
    const fill = spy.callsOf('fill').at(-1);
    expect(fill?.fillStyle).toBe(String(grad));
  });
});
