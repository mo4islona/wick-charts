import type { PaintEnv, PointPaintArgs, PointPainter } from './types';

/** Options of the shape presets. Sizes are CSS px, colors default per preset. */
export interface PointShapeOptions {
  /** Default: `points.radius`. */
  radius?: number;
  /** Default: the marker color. `ringPoint`: the theme background. */
  fill?: string;
  /** Default: no outline. `ringPoint`: the marker color. */
  stroke?: string;
  /** Default: `1` with a `stroke`. `ringPoint`: `1.5`. */
  strokeWidth?: number;
}

type TraceShape = (ctx: CanvasRenderingContext2D, center: { x: number; y: number }, radius: number) => void;

// The hovered dot and its halo match the default crosshair dot: 3 → 4 px, plus 3 px at 25%.
const HOVER_SCALE = 4 / 3;
const HALO_PX = 3;
const HALO_ALPHA = 0.25;

const traceCircle: TraceShape = (ctx, { x, y }, radius) => {
  ctx.arc(x, y, radius, 0, Math.PI * 2);
};

// The polygons stretch past `radius` so they read as heavy as a dot of the same radius.
const traceSquare: TraceShape = (ctx, { x, y }, radius) => {
  const half = radius * 0.9;

  ctx.rect(x - half, y - half, half * 2, half * 2);
};

const traceDiamond: TraceShape = (ctx, { x, y }, radius) => {
  const reach = radius * 1.25;

  ctx.moveTo(x, y - reach);
  ctx.lineTo(x + reach, y);
  ctx.lineTo(x, y + reach);
  ctx.lineTo(x - reach, y);
  ctx.closePath();
};

const traceTriangle: TraceShape = (ctx, { x, y }, radius) => {
  const reach = radius * 1.35;

  ctx.moveTo(x, y - reach);
  ctx.lineTo(x + reach * 0.866, y + reach / 2);
  ctx.lineTo(x - reach * 0.866, y + reach / 2);
  ctx.closePath();
};

function paintShape(
  env: PaintEnv,
  point: PointPaintArgs,
  shape: { trace: TraceShape; fill: string; stroke: string | undefined; strokeWidth: number; radius: number },
): void {
  const { ctx, horizontalPixelRatio: ratio } = env;
  const { trace, fill, stroke, strokeWidth } = shape;
  const radius = point.hovered ? shape.radius * HOVER_SCALE : shape.radius;

  if (point.hovered) {
    ctx.save();
    ctx.globalAlpha *= HALO_ALPHA;
    ctx.beginPath();
    trace(ctx, point, radius + HALO_PX * ratio);
    ctx.fillStyle = stroke ?? fill;
    ctx.fill();
    ctx.restore();
  }

  ctx.beginPath();
  trace(ctx, point, radius);
  ctx.fillStyle = fill;
  ctx.fill();

  if (stroke === undefined || strokeWidth <= 0) return;

  ctx.strokeStyle = stroke;
  ctx.lineWidth = strokeWidth * ratio;
  ctx.stroke();
}

function shapePainter(trace: TraceShape, options: PointShapeOptions): PointPainter {
  return (env, point) => {
    const radius = options.radius === undefined ? point.radius : options.radius * env.horizontalPixelRatio;

    paintShape(env, point, {
      trace,
      radius,
      fill: options.fill ?? point.color,
      stroke: options.stroke,
      strokeWidth: options.strokeWidth ?? 1,
    });
  };
}

/** A filled dot. With no options it looks like the default marker, and it grows on hover. */
export function dotPoint(options: PointShapeOptions = {}): PointPainter {
  return shapePainter(traceCircle, options);
}

/** A hollow ring: a background-filled dot with an outline in the marker color. */
export function ringPoint(options: PointShapeOptions = {}): PointPainter {
  return (env, point) => {
    const radius = options.radius === undefined ? point.radius : options.radius * env.horizontalPixelRatio;

    paintShape(env, point, {
      trace: traceCircle,
      radius,
      fill: options.fill ?? env.theme.background,
      stroke: options.stroke ?? point.color,
      strokeWidth: options.strokeWidth ?? 1.5,
    });
  };
}

export function squarePoint(options: PointShapeOptions = {}): PointPainter {
  return shapePainter(traceSquare, options);
}

export function diamondPoint(options: PointShapeOptions = {}): PointPainter {
  return shapePainter(traceDiamond, options);
}

export function trianglePoint(options: PointShapeOptions = {}): PointPainter {
  return shapePainter(traceTriangle, options);
}

/**
 * Markers only on the points `predicate` picks: every Nth, over a threshold, or
 * flagged by time. `(point) => point.hovered` shows none until hover.
 * The density check does not apply, as few points get a marker.
 */
export function pointsWhere(predicate: (point: PointPaintArgs) => boolean, painter?: PointPainter): PointPainter {
  const inner = painter ?? dotPoint();

  const selected: PointPainter = (env, point) => {
    if (!predicate(point)) return false;

    return inner(env, point);
  };
  selected.selective = true;

  return selected;
}

/** A marker on the layer's latest point only. */
export function lastPointOnly(painter?: PointPainter): PointPainter {
  return pointsWhere((point) => point.isLast, painter);
}

/** Markers on the lowest and the highest point in view. */
export function extremaPoints(painter?: PointPainter): PointPainter {
  return pointsWhere((point) => point.isMin || point.isMax, painter);
}
