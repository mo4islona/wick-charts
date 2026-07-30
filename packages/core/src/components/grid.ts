import type { BitmapCoordinateSpace } from '../canvas-manager';
import type { TickTrackerSnapshot } from '../scales/tick-tracker';
import type { XScale } from '../scales/x-scale';
import type { YScale } from '../scales/y-scale';
import type { ChartTheme } from '../theme/types';
import { crispCenterOffset, crispLineWidth } from '../utils/pixel-grid';

export interface RenderGridArgs {
  scope: BitmapCoordinateSpace;
  timeScale: XScale;
  yScale: YScale;
  theme: ChartTheme;
  /** Faded tick state from `yScale.tickTracker`. */
  yTicks: TickTrackerSnapshot;
  /** Faded tick state from `timeScale.tickTracker`. */
  timeTicks: TickTrackerSnapshot;
  /**
   * Layer-wide opacity multiplier — the chart's reveal / hide fade. Defaults
   * to fully opaque for callers that don't animate the layer.
   */
  alpha?: number;
}

/**
 * Draw the grid for both axes. Each tick is stroked individually so its
 * `opacity` (from the shared `AxisTickTracker`) can drive `globalAlpha` —
 * new ticks fade in and leaving ticks fade out in lockstep with the DOM
 * labels above them. The per-tick `beginPath`/`stroke` pair costs ≤ ~30
 * stroke calls per axis (typical 5-10 ticks, hard-capped at 50) which is
 * negligible compared to the rest of the main-layer draw.
 *
 * `alpha` scales every tick on top of its own fade, giving the whole layer
 * one reveal / hide ramp without disturbing the per-tick timelines.
 */
export function renderGrid({ scope, timeScale, yScale, theme, yTicks, timeTicks, alpha = 1 }: RenderGridArgs): void {
  if (alpha <= 0.01) return;

  const { context, bitmapSize, horizontalPixelRatio, verticalPixelRatio } = scope;

  context.save();
  context.strokeStyle = theme.grid.color;

  if (theme.grid.style === 'dashed') {
    context.setLineDash([4 * horizontalPixelRatio, 4 * horizontalPixelRatio]);
  } else if (theme.grid.style === 'dotted') {
    context.setLineDash([1 * horizontalPixelRatio, 3 * horizontalPixelRatio]);
  }

  // Scale the stroke to device pixels so gridlines stay 1 CSS-px crisp at any
  // DPR (matching the series strokes), instead of rendering at a faint 0.5
  // CSS-px on HiDPI. Shared with the scales' `valueToSnappedY` so DOM axis
  // labels land on the same pixel as the line they name.
  const yLineWidth = crispLineWidth(verticalPixelRatio);
  const yHalf = crispCenterOffset(verticalPixelRatio);
  context.lineWidth = yLineWidth;
  for (const { value, opacity } of yTicks.entries) {
    const faded = opacity * alpha;
    if (faded <= 0.01) continue;

    const y = Math.round(yScale.valueToBitmapY(value)) + yHalf;
    context.globalAlpha = faded;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(bitmapSize.width, y);
    context.stroke();
  }

  const xLineWidth = crispLineWidth(horizontalPixelRatio);
  const xHalf = crispCenterOffset(horizontalPixelRatio);
  context.lineWidth = xLineWidth;
  for (const { value, opacity } of timeTicks.entries) {
    const faded = opacity * alpha;
    if (faded <= 0.01) continue;

    const x = Math.round(timeScale.timeToBitmapX(value)) + xHalf;
    context.globalAlpha = faded;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, bitmapSize.height);
    context.stroke();
  }

  context.restore();
}
