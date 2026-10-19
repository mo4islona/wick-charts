/**
 * Pluggable "loading" indicator — painted into the clipped stage
 * {@link ChartInstance.setEdgeIndicator} anchors at the data boundary while
 * an `EdgeLoader`-style edge fetch is in flight. Same contract shape as the
 * series intro animations (`LineIntroFn` et al.) — a plain function reading
 * a frame snapshot and painting directly, so a custom indicator is a peer of
 * the built-in presets (`glassLoadingIndicator` et al.), not a second-class hook:
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
import type { EdgeSide } from './edge-indicator';

/**
 * One placeholder shape a loading indicator painted, in chart-media pixels
 * relative to the data boundary — the hand-off currency between an edge
 * indicator and a series' history reveal. `offsetX` grows away from the
 * data (into the overshoot zone), so the geometry stays glued to the
 * boundary while the user keeps panning.
 */
export interface PlaceholderBar {
  /** Distance from the data boundary to the bar's center, media px, ≥ 0. */
  offsetX: number;
  /** Bar center Y, media px within the plot area. */
  y: number;
  /** Half the body height, media px. */
  halfHeight: number;
  /** Body width, media px. */
  width: number;
}

/** Mark sizes a series reports so placeholders match its real marks — see `SeriesRenderer.placeholderStyle`. */
export interface PlaceholderStyle {
  /** Width of one candle body or bar, media px. */
  bodyWidth?: number;
  /** Line stroke width, media px. */
  strokeWidth?: number;
}

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
   * Y position (media px) of the value that series' bars grow from — the
   * zero line, or the plot floor on a log scale. Lets a bar placeholder
   * stand on the same baseline as the real bars. `undefined` when
   * `edgeValueY` is.
   */
  baselineY?: number;
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
  /**
   * Width (media px) of one real candle body or bar at the current zoom, so
   * a placeholder is exactly as wide as the mark that replaces it.
   * `undefined` when the series doesn't report one (a line).
   */
  bodyWidth?: number;
  /** Stroke width (media px) of the primary series when it is a line. */
  strokeWidth?: number;
  /**
   * Report the placeholder shapes drawn this frame. The chart snapshots the
   * latest report and, when the fetched history lands, hands it to the
   * series' history reveal — a morph-style reveal (`skeletonMorphIntro`)
   * grows the real candles out of these exact placeholders instead of
   * cross-fading. Optional both ways: an indicator that never reports (or
   * a chart caller that doesn't collect) simply falls back to the plain
   * reveal.
   */
  reportPlaceholders?(bars: PlaceholderBar[]): void;
}

/** Pure function contract for a pluggable loading indicator. */
export type LoadingIndicatorFn = (args: LoadingIndicatorArgs) => void;
