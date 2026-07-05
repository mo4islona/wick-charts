/**
 * Pluggable "loading" indicator — painted into the clipped stage
 * {@link ChartInstance.setEdgeIndicator} anchors at the data boundary while
 * an `EdgeLoader`-style edge fetch is in flight. Same contract shape as the
 * series intro animations (`LineIntroFn` et al.) — a plain function reading
 * a frame snapshot and painting directly, so a custom indicator is a peer of
 * the built-in `skeletonLoadingIndicator`, not a second-class hook:
 *
 * ```ts
 * const dashLoader: LoadingIndicatorFn = ({ scope, chartMediaWidth, chartMediaHeight }) => {
 *   scope.context.strokeRect(0, 0, chartMediaWidth * scope.horizontalPixelRatio, chartMediaHeight * scope.verticalPixelRatio);
 * };
 * chart.setEdgeIndicator('left', dashLoader);
 * ```
 */

import type { BitmapCoordinateSpace } from '../canvas-manager';
import type { SeriesKind } from '../series/types';
import type { ChartTheme } from '../theme/types';
import { hexToRgba } from '../utils/color';
import type { EdgeSide } from './edge-indicator';

/** Read view of one loading-indicator frame — everything a {@link LoadingIndicatorFn} may need. */
export interface LoadingIndicatorArgs {
  scope: BitmapCoordinateSpace;
  theme: ChartTheme;
  /**
   * Plot-area size in CSS/media pixels (excludes the axis bands) — multiply
   * by the scope's pixel ratios to get bitmap units.
   */
  chartMediaWidth: number;
  chartMediaHeight: number;
  /** Animation timestamp, typically `performance.now()`. */
  now: number;
  /**
   * Which edge this indicator's stage is anchored to. `'left'` means the
   * data boundary sits at local x = `chartMediaWidth` (the stage extends
   * further away from the data as x decreases); `'right'` means the
   * boundary sits at local x = `0`. Present only when painted by
   * `chart.setEdgeIndicator` — absent for a hypothetical future non-edge
   * caller.
   */
  side?: EdgeSide;
  /**
   * Y position (media px, within `[0, chartMediaHeight]`) of the boundary
   * point on the chart's primary visible time series — lets an indicator
   * start exactly where the real data leaves off. `undefined` when there's
   * no visible time series or no data resolvable at the boundary.
   */
  edgeValueY?: number;
  /**
   * Media px between adjacent bars at the chart's current zoom level — lets
   * an indicator size its placeholder shapes to match the real candles/bars
   * that will render once data lands. `undefined` when not resolvable (e.g.
   * a chart with no meaningful viewport span yet).
   */
  barSpacing?: number;
  /**
   * Kind of the primary visible time series (`'candlestick'`, `'line'`,
   * `'bar'`, ...) — lets an indicator adapt its shape to what's actually
   * loading instead of always drawing one fixed shape. `undefined` when
   * unresolvable.
   */
  seriesKind?: SeriesKind;
}

/** Pure function contract for a pluggable loading indicator. */
export type LoadingIndicatorFn = (args: LoadingIndicatorArgs) => void;

const SKELETON_BAR_COUNT = 6;
/** Gap used when `barSpacing` isn't resolvable (media px). */
const SKELETON_FALLBACK_GAP_MEDIA = 24;
/** Fraction of the real bar spacing a placeholder body occupies. */
const SKELETON_BODY_RATIO = 0.55;
const SKELETON_WICK_MEDIA = 5;
const SKELETON_SHIMMER_PERIOD_MS = 1400;
/** Half-width of the bright shimmer band, in media pixels. */
const SKELETON_SHIMMER_HALF_WIDTH_MEDIA = 35;

interface SkeletonBar {
  x: number;
  y: number;
  halfHeight: number;
  width: number;
}

/**
 * "Chart skeleton" — muted placeholder candle shapes with a soft shimmer
 * band sweeping across them, the classic skeleton-screen pattern adapted for
 * a time-series stage. The bar nearest the boundary is centered on the real
 * {@link LoadingIndicatorArgs.edgeValueY} so it still visually picks up
 * where the chart leaves off; the rest are honest placeholders (a gentle
 * taper), not a prediction. Falls back to mid-height when no boundary value
 * is resolvable (e.g. an empty chart).
 *
 * Placeholder size tracks {@link LoadingIndicatorArgs.barSpacing} — the
 * chart's actual current zoom level — so bars don't visually "pop" to a
 * different size once real data lands; when it isn't resolvable, falls back
 * to a fixed gap. Wick stubs only draw for `seriesKind === 'candlestick'`
 * (or when the kind isn't resolvable, since candlestick is the common case);
 * a `'line'`/`'bar'` series gets a plain placeholder body instead, since a
 * wick reads as OHLC-specific.
 */
export const skeletonLoadingIndicator: LoadingIndicatorFn = ({
  scope,
  theme,
  chartMediaWidth,
  chartMediaHeight,
  now,
  side,
  edgeValueY,
  barSpacing,
  seriesKind,
}) => {
  const { context, horizontalPixelRatio, verticalPixelRatio } = scope;
  const baseColor = theme.axis.textColor ?? '#787b86';
  const anchorY = edgeValueY ?? chartMediaHeight / 2;
  const fromRight = side === 'right';
  const gap = barSpacing && barSpacing > 4 ? barSpacing : SKELETON_FALLBACK_GAP_MEDIA;
  const barWidth = Math.max(3, gap * SKELETON_BODY_RATIO);
  const drawWick = seriesKind === undefined || seriesKind === 'candlestick';
  const maxHalfHeight = Math.min(chartMediaHeight * 0.22, 34);
  const bars = Math.max(3, Math.min(SKELETON_BAR_COUNT, Math.floor(chartMediaWidth / gap)));

  context.save();

  const shapes: SkeletonBar[] = [];
  for (let i = 0; i < bars; i++) {
    const x = fromRight ? gap * 0.7 + i * gap : chartMediaWidth - gap * 0.7 - i * gap;
    // Gentle deterministic taper away from the anchor — never a "prediction",
    // just plausible placeholder variation.
    const taper = Math.sin(i * 1.1 + 0.6) * 0.4;
    const y = i === 0 ? anchorY : anchorY + taper * maxHalfHeight * 1.4;
    const halfHeight = Math.max(6, maxHalfHeight * (0.5 + 0.5 * Math.abs(Math.cos(i * 0.8))));
    shapes.push({ x, y, halfHeight, width: barWidth });

    const bx = x * horizontalPixelRatio;
    const bw = barWidth * horizontalPixelRatio;
    const topBy = (y - halfHeight) * verticalPixelRatio;
    const bh = halfHeight * 2 * verticalPixelRatio;

    context.fillStyle = hexToRgba(baseColor, 0.16);
    context.fillRect(bx - bw / 2, topBy, bw, bh);

    if (drawWick) {
      context.strokeStyle = hexToRgba(baseColor, 0.12);
      context.lineWidth = Math.max(1, horizontalPixelRatio);
      context.beginPath();
      context.moveTo(bx, topBy - SKELETON_WICK_MEDIA * verticalPixelRatio);
      context.lineTo(bx, topBy);
      context.moveTo(bx, topBy + bh);
      context.lineTo(bx, topBy + bh + SKELETON_WICK_MEDIA * verticalPixelRatio);
      context.stroke();
    }
  }

  // Shimmer sweep — a soft highlight band traveling across the placeholders,
  // reversing direction so it always travels away from the anchor first.
  const span = chartMediaWidth + SKELETON_SHIMMER_HALF_WIDTH_MEDIA * 2;
  const phase = (now % SKELETON_SHIMMER_PERIOD_MS) / SKELETON_SHIMMER_PERIOD_MS;
  const travel = phase * span - SKELETON_SHIMMER_HALF_WIDTH_MEDIA;
  const sweepX = fromRight ? travel : chartMediaWidth - travel;

  const gradient = context.createLinearGradient(
    (sweepX - SKELETON_SHIMMER_HALF_WIDTH_MEDIA) * horizontalPixelRatio,
    0,
    (sweepX + SKELETON_SHIMMER_HALF_WIDTH_MEDIA) * horizontalPixelRatio,
    0,
  );
  gradient.addColorStop(0, hexToRgba(baseColor, 0));
  gradient.addColorStop(0.5, hexToRgba(baseColor, 0.35));
  gradient.addColorStop(1, hexToRgba(baseColor, 0));
  context.fillStyle = gradient;

  for (const bar of shapes) {
    const bx = bar.x * horizontalPixelRatio;
    const bw = bar.width * horizontalPixelRatio;
    const topBy = (bar.y - bar.halfHeight) * verticalPixelRatio;
    const bh = bar.halfHeight * 2 * verticalPixelRatio;
    context.fillRect(bx - bw / 2, topBy, bw, bh);
  }

  context.restore();
};
