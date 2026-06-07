import type { ChartTheme } from '../../theme/types';

/**
 * Which corners a rounded-rect path rounds. A `false` corner is drawn square.
 * The RENDERER owns this decision (it knows the stack / overlap / percent mode);
 * a painter consumes the mask verbatim and never infers which edge is free.
 */
export interface CornerMask {
  tl: boolean;
  tr: boolean;
  br: boolean;
  bl: boolean;
}

/**
 * Engine context shared by every painter. `ctx.globalAlpha` is ALREADY composed
 * (layer × series × entrance fade) by the renderer, and every geometry handed to
 * a painter is already post-transform. Painters MUST NOT mutate `globalAlpha`
 * and MUST NOT re-run an entrance transform.
 */
export interface PaintEnv {
  ctx: CanvasRenderingContext2D;
  theme: ChartTheme;
  /** Horizontal device-pixel ratio — scale your own CSS-px radii / insets by this. */
  horizontalPixelRatio: number;
  /** Vertical device-pixel ratio. */
  verticalPixelRatio: number;
}

/** Post-transform bitmap rectangle a bar painter fills. */
export interface BarGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  /** The edge the bar grows from — the zero line, or the segment's own base. */
  baselineY: number;
}

/** Arguments handed to a {@link BarPainter} once per bar / stacked segment. */
export interface BarPaintArgs {
  geom: BarGeometry;
  /** Semantic fill color — the legend / tooltip source of truth. */
  color: string;
  /**
   * Free-end-aware corner mask. The renderer computed this from the draw mode
   * (single / overlap / stacked-positive / stacked-negative / percent). A square
   * bar arrives as all-false.
   */
  corners: CornerMask;
  /** Resolved, pre-clamped bitmap radius. `0` means square. */
  radius: number;
  /**
   * Entrance progress 0→1; advisory only — `geom` is already transformed by it.
   * Forced to `1` when `isProjected` (a forecast bar doesn't "arrive").
   */
  progress: number;
  /** Ghost / forecast flag derived from the series' `projectedFrom`. */
  isProjected: boolean;
}

/** Paints one bar / stacked segment. Owns its fill — it calls `ctx.fill()`. */
export type BarPainter = (env: PaintEnv, args: BarPaintArgs) => void;

/** Post-transform bitmap rectangle a candle-body painter fills. */
export interface CandleGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Arguments handed to a {@link CandlePainter} once per candle body. */
export interface CandlePaintArgs {
  geom: CandleGeometry;
  /**
   * Engine-resolved fillStyle — the 2-stop gradient when the body color is a
   * `[top, bottom]` tuple AND the body is tall enough, else the flat color. It
   * is ALSO pre-set on `ctx.fillStyle`, so a painter that ignores this field
   * still fills correctly. The painter MUST NOT call `createLinearGradient` —
   * the ≤2px collapse and gradient build already happened upstream.
   */
  fillStyle: string | CanvasGradient;
  /** Representative flat color (the gradient's top stop). For derived shades. */
  color: string;
  /** All-true for candles (no baseline); the radius is clamped per element. */
  corners: CornerMask;
  /** Resolved, pre-clamped bitmap radius. `0` means square. */
  radius: number;
  /** Entrance progress 0→1; advisory only — `geom` is already transformed. */
  progress: number;
  /** `close >= open`. */
  isBullish: boolean;
}

/** Paints one candle body. Owns its fill. Never re-creates the gradient. */
export type CandlePainter = (env: PaintEnv, args: CandlePaintArgs) => void;

/** A single bitmap-space point on a line run. */
export interface LinePoint {
  x: number;
  y: number;
}

/** Arguments handed to a {@link LinePainter} once per finite run. */
export interface LinePaintArgs {
  /**
   * One finite run of points — gaps already split runs, and the trailing-grow
   * endpoint is already appended. Read-only.
   */
  points: readonly LinePoint[];
  color: string;
  lineWidth: number;
  /**
   * `false` while building the stroke path; `true` while building the area-fill
   * top edge, before the engine appends the baseline `lineTo`×2 + `closePath` +
   * `fill`.
   */
  closing: boolean;
  /**
   * `true` while the trailing endpoint is an eased, frame-moving point (the
   * 'grow' entrance). A smooth builder MUST degrade the in-flight last segment to
   * a straight `lineTo` (only the settled run is curve-fit) so the head can't
   * wobble or overshoot while it glides.
   */
  grew: boolean;
}

/**
 * Builds the path for one finite run. MUST issue only
 * `moveTo` / `lineTo` / `bezierCurveTo` / `quadraticCurveTo` onto `env.ctx`, and
 * MUST NOT call `beginPath` / `stroke` / `fill` / `closePath` — the engine wraps
 * the builder so the SAME path drives both the stroke and the baseline-closed
 * area polygon.
 */
export type LinePainter = (env: PaintEnv, args: LinePaintArgs) => void;
