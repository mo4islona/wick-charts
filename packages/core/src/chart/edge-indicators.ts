/**
 * Edge-indicator rendering. Pulled out of ChartInstance because both
 * functions are pure reads — they hand off to {@link renderEdgeIndicator}
 * and only need the current per-side state + cached overshoot boundary
 * to anchor the indicator.
 */

import type { CanvasManager } from '../canvas-manager';
import { type EdgeSide, type EdgeState, renderEdgeIndicator } from '../components/edge-indicator';
import type { LoadingIndicatorFn, PlaceholderBar } from '../components/loading-indicator';
import type { XScale } from '../scales/x-scale';
import type { SeriesKind } from '../series/types';
import type { ChartTheme } from '../theme/types';
import type { OHLCData, TimePoint } from '../types';

export interface EdgeIndicatorContext {
  scope: Parameters<Parameters<CanvasManager['useOverlayLayer']>[0]>[0];
  chartMediaWidth: number;
  chartMediaHeight: number;
  timeScale: XScale;
  theme: ChartTheme;
  edgeStates: Record<EdgeSide, EdgeState>;
  /**
   * Per-side exit-fade alpha in `(0, 1]` while a side that just left
   * `loading` is still fading out, `null` otherwise. A fading side paints
   * one more `loading` frame at this alpha even though its state is already
   * `idle`/`has-more`.
   */
  edgeExitFades: Record<EdgeSide, number | null>;
  /** Per-side custom `loading` painter, same contract as the series intro animations. `null` falls back to the built-in dots. */
  edgeIndicatorFns: Record<EdgeSide, LoadingIndicatorFn | null>;
  /**
   * Resolve a side's anchor time. Returns `null` when neither a cached
   * overshoot nor a current data edge is available.
   */
  resolveBoundary(side: EdgeSide): number | null;
  /**
   * Resolve the boundary point's Y position and series kind on the primary
   * visible time series, for a custom indicator that wants to start exactly
   * where the real chart leaves off and match its shape.
   */
  resolveEdgeAnchor(side: EdgeSide, boundaryTime: number): { valueY: number; seriesKind: SeriesKind } | null;
  /**
   * Resolve the media-pixel spacing between adjacent bars at the chart's
   * current zoom level, for a custom indicator that wants to size its
   * placeholder shapes to match the real bars.
   */
  resolveEdgeBarSpacing(): number | null;
  /**
   * Snapshot a side's placeholder shapes for the history-reveal hand-off —
   * see {@link LoadingIndicatorArgs.reportPlaceholders}.
   */
  reportPlaceholders(side: EdgeSide, bars: PlaceholderBar[]): void;
}

export function drawEdgeIndicators(ctx: EdgeIndicatorContext): void {
  const now = performance.now();
  for (const side of ['left', 'right'] as const) {
    let state = ctx.edgeStates[side];
    let alpha = 1;
    if (state === 'idle' || state === 'has-more') {
      // A side that just left `loading` keeps painting the loading frame at
      // decreasing alpha — the exit fade that hands off to the data reveal.
      const fade = ctx.edgeExitFades[side];
      if (fade === null) continue;

      state = 'loading';
      alpha = fade;
    }

    const boundaryTime = ctx.resolveBoundary(side);
    if (boundaryTime === null) continue;

    const { context } = ctx.scope;
    if (alpha < 1) {
      context.save();
      context.globalAlpha *= alpha;
    }

    renderEdgeIndicator({
      scope: ctx.scope,
      timeScale: ctx.timeScale,
      theme: ctx.theme,
      chartMediaWidth: ctx.chartMediaWidth,
      chartMediaHeight: ctx.chartMediaHeight,
      boundaryTime,
      side,
      state,
      now,
      customIndicator: ctx.edgeIndicatorFns[side],
      resolveEdgeAnchor: () => ctx.resolveEdgeAnchor(side, boundaryTime),
      resolveEdgeBarSpacing: () => ctx.resolveEdgeBarSpacing(),
      reportPlaceholders: (bars) => ctx.reportPlaceholders(side, bars),
    });

    if (alpha < 1) context.restore();
  }
}

/**
 * Pick the boundary time to anchor an edge indicator. Prefer the cached
 * value emitted by the most recent `edgeReached` — that's the *exact* point
 * the user overshot. Fall back to the current data edge when no gesture has
 * fired yet (host may invoke `setEdgeState` directly on mount to show a
 * "no-data" marker from the start).
 */
export function resolveEdgeBoundary(
  side: EdgeSide,
  cached: number | null,
  dataBounds: { first: number | undefined; last: number | undefined },
): number | null {
  if (cached !== null) return cached;

  return side === 'left' ? (dataBounds.first ?? null) : (dataBounds.last ?? null);
}

/**
 * Pick the value a `loading` continuation indicator should anchor to at the
 * boundary point — the field that reads as "immediately preceding" the
 * overshoot zone. `left` (loading older history) continues from `open` (the
 * value the boundary candle opened at); `right` (loading newer data)
 * continues from `close`. A `TimePoint` (line/bar) has only one field.
 */
export function resolveEdgeAnchorValue(side: EdgeSide, point: OHLCData | TimePoint): number {
  if ('close' in point) return side === 'left' ? point.open : point.close;

  return point.value;
}
