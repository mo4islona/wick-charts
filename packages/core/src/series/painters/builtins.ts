import { hexToRgba } from '../../utils/color';
import { fillRoundedRect, tracePath } from './canvas-path';
import type { BarPainter, CandlePainter, LinePainter } from './types';

/** Opacity of a ghost / forecast bar's fill. Low enough that grid lines read
 *  through it; high enough that the bar's color is still recognizable. */
const PROJECTED_ALPHA = 0.25;

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

/** DEFAULT candle-body painter (registered as `'rounded'`). Fills with the
 *  engine-resolved `fillStyle` (gradient or flat) and never rebuilds a gradient. */
export const roundedCandleFill: CandlePainter = (env, args) => {
  const { ctx } = env;
  const { geom, fillStyle, corners, radius } = args;

  ctx.fillStyle = fillStyle;
  fillRoundedRect(ctx, {
    x: geom.x,
    y: geom.y,
    width: geom.width,
    height: geom.height,
    radius,
    corners,
  });
};
