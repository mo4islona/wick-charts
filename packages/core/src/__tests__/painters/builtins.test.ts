import { describe, expect, it } from 'vitest';

import {
  hollowCandle,
  ohlcBar,
  roundedBarFill,
  roundedCandleFill,
  smoothCurve,
  steppedCurve,
  straightCurve,
} from '../../series/painters/builtins';
import type { CandlePaintArgs, CornerMask, LinePoint, PaintEnv } from '../../series/painters/types';
import { createRecordingContext } from '../../testing/recording-context';
import { catppuccin } from '../../theme/themes/catppuccin';

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

// A bullish candle: wick 2..62, body 8..48 (close on top), wick centered in the body.
function candleArgs(overrides: Partial<CandlePaintArgs> = {}): CandlePaintArgs {
  return {
    element: 'body',
    wick: { x: 9, y: 2, width: 2, height: 60 },
    body: { x: 4, y: 8, width: 12, height: 40 },
    openY: 48,
    closeY: 8,
    fillStyle: '#26a69a',
    bodyColor: '#26a69a',
    wickColor: '#115544',
    corners: ALL,
    radius: 3,
    progress: 1,
    isBullish: true,
    ...overrides,
  };
}

describe('roundedCandleFill', () => {
  it('uses the engine-resolved gradient fillStyle and never rebuilds a gradient', () => {
    const { ctx, spy } = createRecordingContext();
    const grad = ctx.createLinearGradient(0, 8, 0, 48);
    grad.addColorStop(0, '#26a69a');
    grad.addColorStop(1, '#1b6e66');
    const beforeGradients = spy.countOf('createLinearGradient');

    roundedCandleFill(makeEnv(ctx), candleArgs({ fillStyle: grad }));

    // The painter builds zero additional gradients.
    expect(spy.countOf('createLinearGradient')).toBe(beforeGradients);
    const fill = spy.callsOf('fill').at(-1);
    expect(fill?.fillStyle).toBe(String(grad));
  });

  it('draws the wick as one plain rect over the full high-low span', () => {
    const { ctx, spy } = createRecordingContext();

    roundedCandleFill(makeEnv(ctx), candleArgs({ element: 'wick', fillStyle: '#115544' }));

    expect(spy.callsOf('fillRect').map((c) => c.args)).toEqual([[9, 2, 2, 60]]);
    expect(spy.callsOf('fillRect')[0].fillStyle).toBe('#115544');
  });
});

describe('hollowCandle', () => {
  it('stops the wick at the body edges', () => {
    const { ctx, spy } = createRecordingContext();

    hollowCandle(makeEnv(ctx), candleArgs({ element: 'wick', fillStyle: '#115544' }));

    // Above the body (2 → 8) and below it (48 → 62); nothing crosses the hole.
    expect(spy.callsOf('fillRect').map((c) => c.args)).toEqual([
      [9, 2, 2, 6],
      [9, 48, 2, 14],
    ]);
  });

  it('outlines a rising body one wick wide, stroked on the centre line', () => {
    const { ctx, spy } = createRecordingContext();
    ctx.setLineDash([4, 4]);

    hollowCandle(makeEnv(ctx), candleArgs());

    expect(spy.countOf('fill')).toBe(0);
    const stroke = spy.callsOf('stroke');
    expect(stroke).toHaveLength(1);
    expect(stroke[0].strokeStyle).toBe('#26a69a');
    expect(stroke[0].lineWidth).toBe(2);
    // A dash left by an earlier pass must not break the outline.
    expect(spy.callsOf('setLineDash').at(-1)?.args).toEqual([[]]);
    // Inset by half the stroke, so the outline's outer edge is the body edge.
    expect(spy.callsOf('moveTo')[0].args).toEqual([4 + 1 + 2, 8 + 1]);
    expect(spy.callsOf('arcTo')[0].args).toEqual([15, 9, 15, 11, 2]);
  });

  it('fills a falling body solid', () => {
    const { ctx, spy } = createRecordingContext();

    hollowCandle(makeEnv(ctx), candleArgs({ isBullish: false, openY: 8, closeY: 48, fillStyle: '#ef5350' }));

    const fill = spy.callsOf('fill');
    expect(fill).toHaveLength(1);
    expect(fill[0].args).toEqual([]);
    expect(fill[0].fillStyle).toBe('#ef5350');
  });

  it('fills a rising body too short for a hole', () => {
    const { ctx, spy } = createRecordingContext();

    hollowCandle(makeEnv(ctx), candleArgs({ body: { x: 4, y: 26, width: 12, height: 3 }, radius: 1.5 }));

    expect(spy.callsOf('fill').every((c) => c.args.length === 0)).toBe(true);
  });
});

describe('ohlcBar', () => {
  it('draws the high-low line in the wick colour', () => {
    const { ctx, spy } = createRecordingContext();

    ohlcBar(makeEnv(ctx), candleArgs({ element: 'wick', fillStyle: '#26a69a' }));

    const rects = spy.callsOf('fillRect');
    expect(rects.map((c) => c.args)).toEqual([[9, 2, 2, 60]]);
    expect(rects[0].fillStyle).toBe('#115544');
  });

  it('puts the open tick left and the close tick right, out to the body edges', () => {
    const { ctx, spy } = createRecordingContext();

    ohlcBar(makeEnv(ctx), candleArgs());

    const rects = spy.callsOf('fillRect');
    expect(rects.map((c) => c.args)).toEqual([
      [4, 47, 5, 2],
      [11, 7, 5, 2],
    ]);
    expect(rects.every((c) => c.fillStyle === '#115544')).toBe(true);
    // No rounded body: cornerRadius does not apply.
    expect(spy.countOf('arcTo')).toBe(0);
  });

  it('reaches past a narrow body into the gap, a pixel short of the neighbour, on whole pixel rows', () => {
    const { ctx, spy } = createRecordingContext();
    const env = { ...makeEnv(ctx), horizontalPixelRatio: 1, verticalPixelRatio: 1 };

    // A 9 px slot: a 4 px body leaves 1 px stubs; the gap gives each tick room for 2 px.
    ohlcBar(
      env,
      candleArgs({
        wick: { x: 9, y: 2, width: 1, height: 60 },
        body: { x: 8, y: 8, width: 3, height: 40 },
        slotWidth: 9,
      }),
    );

    expect(spy.callsOf('fillRect').map((c) => c.args)).toEqual([
      [7, 48, 2, 1],
      [10, 8, 2, 1],
    ]);
  });
});
