/**
 * Pure positioning for a floating tooltip. Flip the tooltip to the other
 * side of the cursor when the preferred side would overflow, then clamp
 * into `[0, chart - size]` so the flipped side can't spill past the
 * opposite edge either.
 *
 * Works for time-series tooltips anchoring to the crosshair and pie
 * tooltips anchoring to a slice centroid alike — pass the chart bounds
 * that match the overlay container (media size minus axis gutters for
 * time-series, full media size for pie).
 */
export interface TooltipPositionArgs {
  /** Cursor or anchor x in CSS pixels, relative to the chart area origin. */
  x: number;
  /** Cursor or anchor y in CSS pixels, relative to the chart area origin. */
  y: number;
  /** Plot-area width in CSS pixels. */
  chartWidth: number;
  /** Plot-area height in CSS pixels. */
  chartHeight: number;
  /** Tooltip box width in CSS pixels. */
  tooltipWidth: number;
  /** Tooltip box height in CSS pixels. */
  tooltipHeight: number;
  /** Gap between anchor and tooltip. Defaults to 16. */
  offsetX?: number;
  offsetY?: number;
}

export interface TooltipPosition {
  left: number;
  top: number;
}

export function computeTooltipPosition(args: TooltipPositionArgs): TooltipPosition {
  const { x, y, chartWidth, chartHeight, tooltipWidth, tooltipHeight, offsetX = 16, offsetY = 16 } = args;
  const rawLeft = x + offsetX + tooltipWidth > chartWidth ? x - offsetX - tooltipWidth : x + offsetX;
  const rawTop = y + offsetY + tooltipHeight > chartHeight ? y - offsetY - tooltipHeight : y + offsetY;
  const maxLeft = Math.max(0, chartWidth - tooltipWidth);
  const maxTop = Math.max(0, chartHeight - tooltipHeight);

  return {
    left: Math.max(0, Math.min(maxLeft, rawLeft)),
    top: Math.max(0, Math.min(maxTop, rawTop)),
  };
}
