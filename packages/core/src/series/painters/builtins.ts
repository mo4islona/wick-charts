import { hexToRgba } from '../../utils/color';
import { fillRoundedRect, tracePath, traceRoundedRect } from './canvas-path';
import type { BarPainter, CandlePaintArgs, CandlePainter, LinePainter, PaintEnv } from './types';

/** Opacity of a ghost / forecast bar's fill. Low enough that grid lines read
 *  through it; high enough that the bar's color is still recognizable. */
const PROJECTED_ALPHA = 0.25;

const NO_DASH: number[] = [];

/** DEFAULT line builder (`curve: 'straight'`). A plain polyline — identical to
 *  the pre-feature stroke path. */
export const straightCurve: LinePainter = (env, args) => {
  tracePath(env, { points: args.points, kind: 'straight', settledOnly: false });
};

/** `curve: 'stepped'` — horizontal-then-vertical step at each sample. */
export const steppedCurve: LinePainter = (env, args) => {
  tracePath(env, { points: args.points, kind: 'stepped', settledOnly: false });
};

/** `curve: 'smooth'` — monotone cubic. The in-flight last segment stays straight
 *  while the trailing endpoint is growing so the head can't wobble / overshoot. */
export const smoothCurve: LinePainter = (env, args) => {
  tracePath(env, { points: args.points, kind: 'smooth', settledOnly: args.grew });
};

/** DEFAULT bar painter (registered as `'rounded'`). Trusts the engine-supplied
 *  `corners` / `radius` / `isProjected`; a projected bar fills with a translucent
 *  derivative of its color instead of mutating `globalAlpha`. */
export const roundedBarFill: BarPainter = (env, args) => {
  const { ctx } = env;
  const { geom, color, corners, radius, isProjected } = args;

  ctx.fillStyle = isProjected ? hexToRgba(color, PROJECTED_ALPHA) : color;
  fillRoundedRect(ctx, {
    x: geom.x,
    y: geom.y,
    width: geom.width,
    height: geom.height,
    radius,
    corners,
  });
};

/** DEFAULT candle painter — filled candles. The wick is a plain rect; the body
 *  fills with the engine-resolved `fillStyle` (gradient or flat), rounded by
 *  `cornerRadius`, and never rebuilds a gradient. */
export const roundedCandleFill: CandlePainter = (env, args) => {
  const { ctx } = env;
  const { wick, body, fillStyle, corners, radius } = args;

  ctx.fillStyle = fillStyle;
  if (args.element === 'wick') {
    ctx.fillRect(wick.x, wick.y, wick.width, wick.height);

    return;
  }

  fillRoundedRect(ctx, {
    x: body.x,
    y: body.y,
    width: body.width,
    height: body.height,
    radius,
    corners,
  });
};

/** Hollow candles: a rising body (close ≥ open) is an outline one wick wide,
 *  a falling body is filled, and the wick stops at the body edges. Pair with
 *  `colorBy: 'previousClose'` for the usual convention, where the colour
 *  follows the previous close. */
export const hollowCandle: CandlePainter = (env, args) => {
  const { ctx } = env;
  const { wick, body, fillStyle, corners, radius } = args;

  ctx.fillStyle = fillStyle;
  if (args.element === 'wick') {
    const bodyBottom = body.y + body.height;
    const wickBottom = wick.y + wick.height;
    if (body.y > wick.y) ctx.fillRect(wick.x, wick.y, wick.width, body.y - wick.y);
    if (wickBottom > bodyBottom) ctx.fillRect(wick.x, bodyBottom, wick.width, wickBottom - bodyBottom);

    return;
  }

  const outer = { x: body.x, y: body.y, width: body.width, height: body.height, radius, corners };
  const stroke = wick.width;
  const hasHole = body.width > stroke * 2 && body.height > stroke * 2;
  if (!args.isBullish || !hasHole) {
    fillRoundedRect(ctx, outer);

    return;
  }

  // A stroke on the centre line, not an even-odd cut-out: GPU canvases draw a
  // stroked rounded rect about as fast as a filled one, a cut-out ~1.6x slower.
  const half = stroke / 2;
  ctx.strokeStyle = fillStyle;
  ctx.lineWidth = stroke;
  ctx.lineJoin = 'miter';
  ctx.setLineDash(NO_DASH);
  ctx.beginPath();
  traceRoundedRect(ctx, {
    x: body.x + half,
    y: body.y + half,
    width: body.width - stroke,
    height: body.height - stroke,
    radius: Math.max(0, radius - half),
    corners,
  });
  ctx.stroke();
};

/** CSS px a tick reaches past a narrow body into the gap, room permitting. */
const OHLC_MIN_TICK = 2;

/** OHLC bars: a high–low line with the open tick on the left and the close
 *  tick on the right, all in the wick colour. Ticks reach the body edges, so
 *  their length follows `bodyWidthRatio`; a narrow body's ticks reach into the
 *  gap, up to 2 px, short of the neighbour's. `cornerRadius` does not apply. */
export const ohlcBar: CandlePainter = (env, args) => {
  const { ctx } = env;
  const { wick, body } = args;

  ctx.fillStyle = args.wickColor;
  if (args.element === 'wick') {
    ctx.fillRect(wick.x, wick.y, wick.width, wick.height);

    return;
  }

  const thickness = wick.width;
  const wickRight = wick.x + wick.width;
  const reach = gapReach(env, args);
  const leftReach = Math.max(wick.x - body.x, reach);
  const rightReach = Math.max(body.x + body.width - wickRight, reach);

  // Whole pixel rows: a 1 px tick centred on a pixel edge paints two rows at half alpha.
  const openY = Math.round(args.openY - thickness / 2);
  const closeY = Math.round(args.closeY - thickness / 2);
  ctx.fillRect(wick.x - leftReach, openY, leftReach, thickness);
  ctx.fillRect(wickRight, closeY, rightReach, thickness);
};

/** How far a tick may reach into the gap: {@link OHLC_MIN_TICK}, leaving a pixel to the neighbour's tick. */
function gapReach(env: PaintEnv, args: CandlePaintArgs): number {
  if (args.slotWidth === undefined) return 0;

  const room = Math.floor((args.slotWidth - args.wick.width - 1) / 2);

  return Math.max(0, Math.min(room, OHLC_MIN_TICK * env.horizontalPixelRatio));
}
