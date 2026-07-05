import type { BitmapCoordinateSpace } from '../canvas-manager';
import type { XScale } from '../scales/x-scale';
import type { SeriesKind } from '../series/types';
import type { ChartTheme } from '../theme/types';
import type { LoadingIndicatorFn } from './loading-indicator';

/** Radius of each spinner dot, in media pixels. */
const DOT_RADIUS_MEDIA = 3;
/** Horizontal gap between adjacent spinner dots, in media pixels. */
const DOT_GAP_MEDIA = 8;
/** Full period of the traveling-pulse spinner animation, in ms. */
const SPINNER_PERIOD_MS = 900;
/** Horizontal inset from the soft-bound boundary where the spinner is drawn, in media pixels. */
const SPINNER_INSET_MEDIA = 24;
/** Font size for the no-data label, in media pixels. */
const NO_DATA_LABEL_SIZE_MEDIA = 11;
/** Horizontal inset for the no-data label from the boundary line, in media pixels. */
const NO_DATA_LABEL_INSET_MEDIA = 10;
/** Vertical inset for the no-data label from the top of the chart area, in media pixels. */
const NO_DATA_LABEL_Y_MEDIA = 18;
/** Width of the pluggable `loading` indicator's clipped stage, in media pixels. */
const CUSTOM_INDICATOR_ZONE_MEDIA = 150;

export type EdgeSide = 'left' | 'right';
export type EdgeState = 'idle' | 'loading' | 'no-data' | 'has-more';

export interface EdgeIndicatorContext {
  scope: BitmapCoordinateSpace;
  timeScale: XScale;
  theme: ChartTheme;
  /** Chart area width in media pixels — bounds how wide the pluggable `loading` zone can be. */
  chartMediaWidth: number;
  /** Chart area height in media pixels (excludes the X-axis band).
   * Renderers multiply by `scope.verticalPixelRatio` to convert to bitmap units. */
  chartMediaHeight: number;
  /** Time coordinate of the data edge that was pulled past. */
  boundaryTime: number;
  /** Which side of the chart the indicator belongs to. */
  side: EdgeSide;
  /** Current host-declared state for this side. */
  state: EdgeState;
  /** Animation timestamp for the spinner. Typically `performance.now()`. */
  now: number;
  /**
   * Custom painter for the `loading` state — same pluggable-function
   * contract as the series intro animations. `null`/absent falls back to
   * the built-in three-dot spinner. Has no effect on the `no-data` state.
   */
  customIndicator?: LoadingIndicatorFn | null;
  /**
   * Resolves the boundary point's Y position and series kind on the primary
   * visible time series, for a custom indicator that wants to start exactly
   * where the real chart leaves off and match its shape. Only called when
   * `customIndicator` is present — cheap to omit otherwise.
   */
  resolveEdgeAnchor?: () => { valueY: number; seriesKind: SeriesKind } | null;
  /**
   * Resolves the media-pixel spacing between adjacent bars at the chart's
   * current zoom level, for a custom indicator that wants to size its
   * placeholder shapes to match the real bars. Only called when
   * `customIndicator` is present.
   */
  resolveEdgeBarSpacing?: () => number | null;
}

/** Draw the edge indicator for the given side/state. A no-op for `idle` / `has-more`. */
export function renderEdgeIndicator(ctx: EdgeIndicatorContext): void {
  const { state } = ctx;
  if (state === 'idle' || state === 'has-more') return;

  const boundaryX = ctx.timeScale.timeToX(ctx.boundaryTime);
  if (!Number.isFinite(boundaryX)) return;

  if (state === 'loading') {
    if (ctx.customIndicator) {
      drawCustomLoadingIndicator(ctx, boundaryX, ctx.customIndicator);
    } else {
      drawLoadingSpinner(ctx, boundaryX);
    }
    return;
  }
  if (state === 'no-data') {
    drawNoDataMarker(ctx, boundaryX);
  }
}

/**
 * Clips a stage anchored at the data boundary — extending into the overshoot
 * zone, away from the data — and hands the caller's {@link LoadingIndicatorFn}
 * a fresh local origin at the stage's near edge. Reuses the same contract the
 * full-plot presets already satisfy: `chartMediaWidth` becomes the stage
 * width instead of the whole plot, everything else is unchanged.
 */
function drawCustomLoadingIndicator(
  {
    scope,
    theme,
    chartMediaWidth,
    chartMediaHeight,
    side,
    now,
    resolveEdgeAnchor,
    resolveEdgeBarSpacing,
  }: EdgeIndicatorContext,
  boundaryX: number,
  indicator: LoadingIndicatorFn,
): void {
  const { context, horizontalPixelRatio, verticalPixelRatio } = scope;
  const zoneWidth = Math.min(CUSTOM_INDICATOR_ZONE_MEDIA, chartMediaWidth);
  const zoneStart = side === 'right' ? boundaryX : boundaryX - zoneWidth;

  context.save();
  context.beginPath();
  context.rect(
    zoneStart * horizontalPixelRatio,
    0,
    zoneWidth * horizontalPixelRatio,
    chartMediaHeight * verticalPixelRatio,
  );
  context.clip();
  context.translate(zoneStart * horizontalPixelRatio, 0);

  const anchor = resolveEdgeAnchor?.() ?? null;
  const barSpacing = resolveEdgeBarSpacing?.() ?? undefined;
  indicator({
    scope,
    theme,
    chartMediaWidth: zoneWidth,
    chartMediaHeight,
    now,
    side,
    edgeValueY: anchor?.valueY,
    seriesKind: anchor?.seriesKind,
    barSpacing,
  });

  context.restore();
}

/**
 * Three-dot traveling-pulse spinner. The dot nearest the traveling phase is
 * brightened — same visual vocabulary as typical chat "typing" indicators.
 */
function drawLoadingSpinner(
  { scope, theme, chartMediaHeight, side, now }: EdgeIndicatorContext,
  boundaryX: number,
): void {
  const { context, horizontalPixelRatio, verticalPixelRatio } = scope;
  const dotRadius = DOT_RADIUS_MEDIA * horizontalPixelRatio;
  const gap = DOT_GAP_MEDIA * horizontalPixelRatio;
  const inset = SPINNER_INSET_MEDIA * horizontalPixelRatio;

  // Spinner sits in the overshoot zone — OUTSIDE the data, past boundaryX.
  const boundaryBX = boundaryX * horizontalPixelRatio;
  const centerBX = side === 'right' ? boundaryBX + inset : boundaryBX - inset;
  const centerBY = (chartMediaHeight / 2) * verticalPixelRatio;

  // Traveling-pulse phase [0, 1), then mapped to each dot's relative brightness.
  const phase = (now % SPINNER_PERIOD_MS) / SPINNER_PERIOD_MS;
  const activeDot = Math.floor(phase * 3);

  const baseColor = hexWithAlpha(theme.axis.textColor ?? '#787b86', 0.3);
  const activeColor = theme.axis.textColor ?? '#787b86';

  context.save();
  for (let i = 0; i < 3; i++) {
    const dx = (i - 1) * gap;
    const x = centerBX + dx;
    context.beginPath();
    context.arc(x, centerBY, dotRadius, 0, Math.PI * 2);
    context.fillStyle = i === activeDot ? activeColor : baseColor;
    context.fill();
  }
  context.restore();
}

/**
 * Static "No more data" marker: a dashed vertical line at the data boundary
 * plus a small label. The label sits inside the chart area so it remains
 * visible even when the overshoot zone is narrow.
 */
function drawNoDataMarker({ scope, theme, chartMediaHeight, side }: EdgeIndicatorContext, boundaryX: number): void {
  const { context, horizontalPixelRatio, verticalPixelRatio } = scope;
  const boundaryBX = Math.round(boundaryX * horizontalPixelRatio) + 0.5;

  // Dashed vertical line at the boundary.
  context.save();
  context.strokeStyle = hexWithAlpha(theme.axis.textColor ?? '#787b86', 0.6);
  context.lineWidth = 1;
  context.setLineDash([4 * horizontalPixelRatio, 4 * horizontalPixelRatio]);
  context.beginPath();
  context.moveTo(boundaryBX, 0);
  context.lineTo(boundaryBX, chartMediaHeight * verticalPixelRatio);
  context.stroke();
  context.setLineDash([]);

  // Label anchored to the interior side of the boundary — never clipped out.
  const inset = NO_DATA_LABEL_INSET_MEDIA * horizontalPixelRatio;
  const labelBX = side === 'right' ? boundaryBX - inset : boundaryBX + inset;
  const labelBY = NO_DATA_LABEL_Y_MEDIA * verticalPixelRatio;

  context.fillStyle = theme.axis.textColor ?? '#787b86';
  context.font = `${NO_DATA_LABEL_SIZE_MEDIA * horizontalPixelRatio}px ${theme.typography.fontFamily}`;
  context.textAlign = side === 'right' ? 'right' : 'left';
  context.textBaseline = 'top';
  context.fillText('No more data', labelBX, labelBY);
  context.restore();
}

/** Apply an alpha channel to a hex color. Falls back to the source when the input isn't a parseable hex. */
function hexWithAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return hex;
  const r = parseInt(match[1].slice(0, 2), 16);
  const g = parseInt(match[1].slice(2, 4), 16);
  const b = parseInt(match[1].slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
