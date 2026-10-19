/**
 * Placeholder geometry shared by the loading presets: the shapes that stand
 * in for the history being fetched, matched to the series kind and to the
 * real marks' sizes, plus a flat 2D drawing of them for a browser without
 * WebGL2.
 */

import { hexToRgba } from '../../utils/color';
import type { LoadingIndicatorArgs } from '../loading-indicator';

/** Uniform array sizes: placeholder rects, and line vertices. */
export const MAX_SHAPES = 10;
export const MAX_POINTS = 16;

/** Vertex spacing floor for a line placeholder, media px — a zoomed-out chart still gets a smooth ribbon. */
const MIN_LINE_STEP = 14;
/** Slot width when the chart can't resolve one, media px. */
const FALLBACK_SLOT = 24;
/** The renderers' default body/bar width ratio — used when the series reports no width. */
const DEFAULT_BODY_RATIO = 0.6;
const DEFAULT_STROKE = 1;

export type ShapeKind = 'candle' | 'bar' | 'line';

export interface StageBar {
  /** Center X, stage-local media px. */
  x: number;
  y: number;
  halfHeight: number;
  width: number;
}

export interface StagePoint {
  x: number;
  y: number;
}

export interface StageShapes {
  kind: ShapeKind;
  /** Candle bodies or bar columns. Empty for a line. */
  bars: StageBar[];
  /** Line vertices from the boundary outward. Empty for candles and bars. */
  points: StagePoint[];
  /** Media px Y bars stand on. */
  baseline: number;
  /** Line stroke width, media px. */
  stroke: number;
}

function shapeKindOf(args: LoadingIndicatorArgs): ShapeKind {
  if (args.seriesKind === 'bar') return 'bar';
  if (args.seriesKind === 'line' || args.seriesKind === 'band') return 'line';

  return 'candle';
}

/** Gentle deterministic wander, 0 at the boundary — a placeholder, not a prediction. */
function drift(i: number): number {
  return Math.sin(i * 0.9 + 0.4) - Math.sin(0.4);
}

/**
 * Placeholder shapes for the series kind, one slot apart from the boundary.
 * Widths copy the real marks (`bodyWidth`, `strokeWidth`), and the first
 * shape continues from the boundary value: a candle centered on it, a bar
 * topped at it, a line starting at it.
 */
export function placeholderShapes(args: LoadingIndicatorArgs): StageShapes {
  const { chartMediaWidth, chartMediaHeight, side, edgeValueY, barSpacing } = args;
  const kind = shapeKindOf(args);
  const anchor = edgeValueY ?? chartMediaHeight / 2;
  const baseline = args.baselineY ?? chartMediaHeight;
  const slot = barSpacing !== undefined && barSpacing > 2 ? barSpacing : FALLBACK_SLOT;
  const stroke = Math.max(1, args.strokeWidth ?? DEFAULT_STROKE);
  const maxHalf = Math.min(chartMediaHeight * 0.22, 34);
  const stageX = (offset: number): number => (side === 'right' ? offset : chartMediaWidth - offset);
  // Keep a shape `margin` px inside the plot, so a boundary near an edge doesn't wander off it.
  const clampY = (y: number, margin: number): number => Math.min(chartMediaHeight - margin, Math.max(margin, y));

  if (kind === 'line') {
    const step = Math.max(slot, MIN_LINE_STEP);
    const count = Math.min(MAX_POINTS, Math.ceil(chartMediaWidth / step) + 1);
    const points: StagePoint[] = [];
    for (let i = 0; i < count; i++) {
      const y = i === 0 ? anchor : clampY(anchor + drift(i) * maxHalf * 0.8, 6);
      points.push({ x: stageX(i * step), y });
    }

    return { kind, bars: [], points, baseline, stroke };
  }

  const width = Math.max(1, args.bodyWidth ?? slot * DEFAULT_BODY_RATIO);
  const count = Math.max(3, Math.min(MAX_SHAPES, Math.floor(chartMediaWidth / slot)));
  const bars: StageBar[] = [];
  for (let i = 0; i < count; i++) {
    const x = stageX((i + 1) * slot);

    if (kind === 'bar') {
      const height = Math.abs(baseline - anchor);
      const scale = i === 0 ? 1 : 0.55 + 0.45 * Math.abs(Math.cos(i * 1.3 + 0.2));
      const top = baseline - Math.sign(baseline - anchor) * Math.max(4, height * scale);
      bars.push({ x, y: (top + baseline) / 2, halfHeight: Math.abs(baseline - top) / 2, width });
      continue;
    }

    const halfHeight = Math.max(6, maxHalf * (0.45 + 0.4 * Math.abs(Math.cos(i * 1.3 + 0.2))));
    bars.push({ x, y: clampY(anchor + drift(i) * maxHalf * 0.9, halfHeight + 6), halfHeight, width });
  }

  return { kind, bars, points: [], baseline, stroke };
}

/** Hand candle shapes to a morph reveal (`skeletonMorphIntro`), in boundary-relative offsets. */
export function reportCandles(args: LoadingIndicatorArgs, shapes: StageShapes): void {
  if (args.reportPlaceholders === undefined || shapes.kind !== 'candle') return;

  const fromRight = args.side === 'right';
  args.reportPlaceholders(
    shapes.bars.map((bar) => ({
      offsetX: fromRight ? bar.x : args.chartMediaWidth - bar.x,
      y: bar.y,
      halfHeight: bar.halfHeight,
      width: bar.width,
    })),
  );
}

/** Rect and vertex arrays in GL px, padded to the uniform array sizes — read by {@link shapesGlsl}. */
export function shapeUniforms(shapes: StageShapes, ratio: number): Record<string, number | number[]> {
  const bars = new Array<number>(MAX_SHAPES * 4).fill(0);
  shapes.bars.forEach((bar, i) => {
    bars[i * 4] = bar.x * ratio;
    bars[i * 4 + 1] = bar.y * ratio;
    bars[i * 4 + 2] = (bar.width / 2) * ratio;
    bars[i * 4 + 3] = bar.halfHeight * ratio;
  });

  const points = new Array<number>(MAX_POINTS * 2).fill(0);
  shapes.points.forEach((point, i) => {
    points[i * 2] = point.x * ratio;
    points[i * 2 + 1] = point.y * ratio;
  });

  const kindCode = { candle: 0, bar: 1, line: 2 }[shapes.kind];

  return {
    u_mode: shapes.kind === 'line' ? 1 : 0,
    u_kind: kindCode,
    u_bars: bars,
    u_count: shapes.bars.length,
    u_points: points,
    u_pointCount: shapes.points.length,
    u_wick: shapes.kind === 'candle' ? 1 : 0,
    u_stroke: (shapes.stroke / 2) * ratio,
    u_baseline: shapes.baseline * ratio,
  };
}

/** GLSL distance helpers over the {@link shapeUniforms} arrays — a function, so importing it runs nothing. */
export function shapesGlsl(): string {
  return `
uniform float u_mode;        // 0 = rects (candles, bars), 1 = line
uniform vec4 u_bars[${MAX_SHAPES}];
uniform float u_count;
uniform float u_wick;
uniform vec2 u_points[${MAX_POINTS}];
uniform float u_pointCount;
uniform float u_stroke;      // line half-width, GL px

float sdRoundBox(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;

  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);

  return length(pa - ba * h);
}

// Signed distance to the nearest placeholder shape; its index in .y.
vec2 shapes(vec2 p) {
  float best = 1e5;
  float index = 0.0;

  if (u_mode > 0.5) {
    for (int i = 0; i < ${MAX_POINTS - 1}; i++) {
      if (float(i) + 1.0 >= u_pointCount) break;

      float d = sdSegment(p, u_points[i], u_points[i + 1]) - u_stroke;
      if (d < best) {
        best = d;
        index = float(i);
      }
    }

    return vec2(best, index);
  }

  for (int i = 0; i < ${MAX_SHAPES}; i++) {
    if (float(i) >= u_count) break;

    vec4 bar = u_bars[i];
    float radius = min(bar.z, 1.5 * u_pr);
    float body = sdRoundBox(p - bar.xy, bar.zw, radius);
    float wick = u_wick > 0.5 ? sdRoundBox(p - bar.xy, vec2(0.5 * u_pr, bar.w + 5.0 * u_pr), 0.5 * u_pr) : 1e5;
    float d = min(body, wick);
    if (d < best) {
      best = d;
      index = float(i);
    }
  }

  return vec2(best, index);
}

// 1 at the top of the shape, 0 at its bottom; flat on a line.
float shapeGloss(vec2 p, float index) {
  if (u_mode > 0.5) return 0.5;

  vec4 bar = u_bars[int(index)];

  return clamp(1.0 - (p.y - (bar.y - bar.w)) / (2.0 * bar.w), 0.0, 1.0);
}
`;
}

const WICK_MEDIA = 5;

/** The shapes in flat ink with a slow breath — what a shader preset draws without WebGL2. */
export function drawFlatShapes(args: LoadingIndicatorArgs, shapes: StageShapes): void {
  const { context, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = args.scope;
  const ink = args.theme.axis.textColor ?? '#787b86';
  const alpha = 0.14 + 0.05 * Math.sin(args.now / 350);

  context.save();
  context.fillStyle = hexToRgba(ink, alpha);
  context.strokeStyle = hexToRgba(ink, alpha);

  if (shapes.kind === 'line') {
    context.lineWidth = shapes.stroke * vpr;
    context.lineJoin = 'round';
    context.beginPath();
    shapes.points.forEach((point, i) => {
      if (i === 0) {
        context.moveTo(point.x * hpr, point.y * vpr);
      } else {
        context.lineTo(point.x * hpr, point.y * vpr);
      }
    });
    context.stroke();
    context.restore();

    return;
  }

  context.lineWidth = Math.max(1, hpr);
  for (const bar of shapes.bars) {
    const left = (bar.x - bar.width / 2) * hpr;
    const top = (bar.y - bar.halfHeight) * vpr;
    const height = bar.halfHeight * 2 * vpr;
    context.fillRect(left, top, bar.width * hpr, height);

    if (shapes.kind === 'candle') {
      context.beginPath();
      context.moveTo(bar.x * hpr, top - WICK_MEDIA * vpr);
      context.lineTo(bar.x * hpr, top);
      context.moveTo(bar.x * hpr, top + height);
      context.lineTo(bar.x * hpr, top + height + WICK_MEDIA * vpr);
      context.stroke();
    }
  }

  context.restore();
}
