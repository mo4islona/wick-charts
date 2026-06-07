import type { CornerMask, LinePoint, PaintEnv } from './types';

/** Arguments for {@link fillRoundedRect}. */
export interface RoundedRectArgs {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Pre-resolved bitmap radius applied to masked corners. */
  radius: number;
  /** Which corners to round; unmasked corners are square. */
  corners: CornerMask;
}

/**
 * Fill a rounded rectangle with per-corner masking, using manual `arcTo` so the
 * output is deterministic and independent of `CanvasRenderingContext2D.roundRect`
 * availability. Self-contained: it opens its own path and fills with the current
 * `ctx.fillStyle`.
 *
 * Degenerate inputs — a sub-1px clamped radius, or a non-positive dimension —
 * fall back to a plain `fillRect`. That guarantees a tiny / 1px bar or a doji can
 * never emit a zero-radius or `NaN` `arcTo`, byte-matching the pre-rounding
 * output for those cases.
 */
export function fillRoundedRect(ctx: CanvasRenderingContext2D, args: RoundedRectArgs): void {
  const { x, y, width, height, corners } = args;
  const r = Math.min(args.radius, width / 2, height / 2);

  // Fall back to a plain `fillRect` when there's nothing to round: no masked
  // corner, a sub-1px clamped radius, or a non-positive dimension. This
  // byte-matches the pre-rounding output (cornerRadius:0, square segments,
  // tiny / 1px bars, dojis) and never emits a near-zero or NaN `arcTo`.
  const anyRounded = corners.tl || corners.tr || corners.br || corners.bl;
  if (!anyRounded || r < 1 || width <= 0 || height <= 0) {
    ctx.fillRect(x, y, width, height);

    return;
  }

  const rtl = corners.tl ? r : 0;
  const rtr = corners.tr ? r : 0;
  const rbr = corners.br ? r : 0;
  const rbl = corners.bl ? r : 0;

  const right = x + width;
  const bottom = y + height;

  ctx.beginPath();
  ctx.moveTo(x + rtl, y);

  ctx.lineTo(right - rtr, y);
  if (rtr > 0) ctx.arcTo(right, y, right, y + rtr, rtr);

  ctx.lineTo(right, bottom - rbr);
  if (rbr > 0) ctx.arcTo(right, bottom, right - rbr, bottom, rbr);

  ctx.lineTo(x + rbl, bottom);
  if (rbl > 0) ctx.arcTo(x, bottom, x, bottom - rbl, rbl);

  ctx.lineTo(x, y + rtl);
  if (rtl > 0) ctx.arcTo(x, y, x + rtl, y, rtl);

  ctx.closePath();
  ctx.fill();
}

/** Path-shape selector for {@link tracePath}. */
export type CurveKind = 'straight' | 'smooth' | 'stepped';

/** Arguments for {@link tracePath}. */
export interface TracePathArgs {
  points: readonly LinePoint[];
  kind: CurveKind;
  /**
   * When `true`, the final segment is drawn as a straight `lineTo` even for the
   * smooth kind — used while the trailing endpoint is mid-grow so the moving head
   * can't wobble or overshoot.
   */
  settledOnly: boolean;
}

/**
 * One emitted path segment ending at `(x, y)`; its start is the previous
 * segment's end (or the run's first point for the first segment). `line` is a
 * straight `lineTo`; `bezier` is a cubic with control points `cp1`/`cp2`.
 */
export type PathSegment =
  | { kind: 'line'; x: number; y: number }
  | { kind: 'bezier'; cp1x: number; cp1y: number; cp2x: number; cp2y: number; x: number; y: number };

/**
 * Build the path segments for one run (everything after `points[0]`). Shared by
 * {@link tracePath} (which emits them forward) and the stacked-area renderer,
 * which replays a boundary's segments forward for one slice's top edge and
 * reversed for the adjacent slice's bottom edge so the two fills share a
 * pixel-identical curve (no sliver gap between tiled slices).
 */
export function buildCurveSegments(points: readonly LinePoint[], kind: CurveKind, settledOnly: boolean): PathSegment[] {
  const segments: PathSegment[] = [];
  if (points.length < 2) return segments;

  if (kind === 'stepped') {
    for (let i = 1; i < points.length; i++) {
      segments.push({ kind: 'line', x: points[i].x, y: points[i - 1].y });
      segments.push({ kind: 'line', x: points[i].x, y: points[i].y });
    }

    return segments;
  }

  // A smooth run needs at least three points to fit a meaningful curve; a
  // 2-point run is a straight segment either way. 'straight' shares the polyline.
  if (kind === 'straight' || points.length === 2) {
    for (let i = 1; i < points.length; i++) {
      segments.push({ kind: 'line', x: points[i].x, y: points[i].y });
    }

    return segments;
  }

  return monotoneSegments(points, settledOnly);
}

/**
 * Emit path commands for one run of points onto `env.ctx`. Issues only
 * `moveTo` / `lineTo` / `bezierCurveTo`; it never opens or closes a path, so the
 * engine can wrap the same trace into both a stroke and a baseline-closed area
 * polygon. Takes the full {@link PaintEnv} (not the raw context) so a custom
 * painter can compose on it directly with the `(env, args)` it receives.
 */
export function tracePath(env: PaintEnv, args: TracePathArgs): void {
  const { ctx } = env;
  const { points } = args;
  if (points.length === 0) return;

  ctx.moveTo(points[0].x, points[0].y);
  const segments = buildCurveSegments(points, args.kind, args.settledOnly);
  for (const seg of segments) {
    if (seg.kind === 'line') {
      ctx.lineTo(seg.x, seg.y);
    } else {
      ctx.bezierCurveTo(seg.cp1x, seg.cp1y, seg.cp2x, seg.cp2y, seg.x, seg.y);
    }
  }
}

/**
 * Fritsch–Carlson monotone cubic, one `bezier` segment per input segment.
 * Monotone (non-overshooting) on purpose: the area fill closes to a baseline, so
 * an overshoot would self-intersect below the curve. Tangents are computed only
 * within the run handed in — never across a gap. A segment whose x is
 * non-increasing (a degenerate / duplicate sample) degrades to a straight
 * `line`, as does the in-flight last segment when `settledOnly` is set.
 */
function monotoneSegments(points: readonly LinePoint[], settledOnly: boolean): PathSegment[] {
  const n = points.length;

  // Secant slope of each segment. A non-positive dx marks a segment we can't fit
  // monotonically; flag it `NaN` so the draw loop degrades just that segment.
  const delta: number[] = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    delta[i] = dx > 0 ? (points[i + 1].y - points[i].y) / dx : Number.NaN;
  }

  // Tangents. Endpoints take their adjacent secant. An interior point at a local
  // extremum — its two flanking secants have opposite signs, or either is flat —
  // gets a zero tangent: that is what keeps the monotone cubic from overshooting
  // past a peak or trough. Otherwise the tangent is the secant average. A
  // non-finite (gap-adjacent) neighbor falls back to the finite side, or zero.
  const m: number[] = new Array(n);
  m[0] = Number.isFinite(delta[0]) ? delta[0] : 0;
  for (let i = 1; i < n - 1; i++) {
    const a = delta[i - 1];
    const b = delta[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      m[i] = Number.isFinite(a) ? a : Number.isFinite(b) ? b : 0;
    } else if (a * b <= 0) {
      m[i] = 0;
    } else {
      m[i] = (a + b) / 2;
    }
  }
  m[n - 1] = Number.isFinite(delta[n - 2]) ? delta[n - 2] : 0;

  // Fritsch–Carlson magnitude clamp: hold each tangent inside a circle of radius
  // 3·secant so the interpolant stays monotone. Extrema are already zeroed above,
  // so `alpha` / `beta` are non-negative on every monotone segment here.
  for (let i = 0; i < n - 1; i++) {
    const d = delta[i];
    if (!Number.isFinite(d) || d === 0) continue;

    const alpha = m[i] / d;
    const beta = m[i + 1] / d;
    const s = alpha * alpha + beta * beta;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * alpha * d;
      m[i + 1] = tau * beta * d;
    }
  }

  // One cubic Bézier per segment (Hermite → Bézier control points).
  const segments: PathSegment[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const isLast = i === n - 2;

    if (!Number.isFinite(delta[i]) || (settledOnly && isLast)) {
      segments.push({ kind: 'line', x: p1.x, y: p1.y });
      continue;
    }

    const dx = p1.x - p0.x;
    segments.push({
      kind: 'bezier',
      cp1x: p0.x + dx / 3,
      cp1y: p0.y + (m[i] * dx) / 3,
      cp2x: p1.x - dx / 3,
      cp2y: p1.y - (m[i + 1] * dx) / 3,
      x: p1.x,
      y: p1.y,
    });
  }

  return segments;
}
