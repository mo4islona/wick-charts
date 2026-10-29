import type { BitmapCoordinateSpace } from '../canvas-manager';
import type { ChartInstance } from '../chart';
import { buildHoverSnapshots, formatHeaderX, hoveredPointTime } from '../snapshots';
import type { ChartTheme } from '../theme/types';
import type { CrosshairPosition } from '../types';

const DAY = 86_400_000;

export interface CrosshairRenderArgs {
  scope: BitmapCoordinateSpace;
  bitmapX: number;
  bitmapY: number;
  theme: ChartTheme;
  /** Pane extent in bitmap px. A hairline whose anchor coordinate sits past
   *  it is skipped — the pointer is over an axis strip, where only the cross
   *  line still anchored inside the pane should show. The caller's clip may
   *  extend past the pane (edge-melt overhangs); this gate keeps an
   *  outside-pane anchor from painting into those overhangs. */
  pane: { width: number; height: number };
  /** Bitmap px the horizontal line starts left of the pane — a left Y-axis
   *  column's fade intrusion. Default `0`. */
  leftOverhang?: number;
  /** Draw the horizontal (value) line. Default `true`. */
  horizontal?: boolean;
}

export function renderCrosshair(args: CrosshairRenderArgs): void {
  const { scope, bitmapX, bitmapY, theme, pane, leftOverhang = 0, horizontal = true } = args;
  const { context, bitmapSize, horizontalPixelRatio, verticalPixelRatio } = scope;

  const drawVertical = bitmapX >= 0 && bitmapX <= pane.width;
  const drawHorizontal = horizontal && bitmapY <= pane.height;
  if (!drawVertical && !drawHorizontal) return;

  // Match device-pixel stroke width to the series so the crosshair reads as
  // crisp as the candles instead of a faint 0.5 CSS-px hairline on HiDPI.
  const vLineWidth = Math.max(1, Math.round(verticalPixelRatio));
  const hLineWidth = Math.max(1, Math.round(horizontalPixelRatio));
  context.strokeStyle = theme.crosshair.color;
  context.lineWidth = Math.max(vLineWidth, hLineWidth);
  context.setLineDash([4 * horizontalPixelRatio, 4 * horizontalPixelRatio]);

  // Half-pixel center snap only for odd widths (even widths sit on an integer
  // device boundary already).
  const x = Math.round(bitmapX) + (hLineWidth % 2 === 1 ? 0.5 : 0);
  const y = Math.round(bitmapY) + (vLineWidth % 2 === 1 ? 0.5 : 0);
  const lineStart = leftOverhang > 0 ? -leftOverhang : 0;

  context.beginPath();
  if (drawVertical) {
    context.moveTo(x, 0);
    context.lineTo(x, bitmapSize.height);
  }
  if (drawHorizontal) {
    context.moveTo(lineStart, y);
    context.lineTo(bitmapSize.width, y);
  }
  context.stroke();

  context.setLineDash([]);
}

/** The crosshair's X-axis pill, placed in container CSS px. */
export interface CrosshairXLabel {
  text: string;
  /** The line's X ({@link crosshairLineX}), which the pill centres on unless the chart edge would cut it. */
  left: number;
  bottom: number;
  transform: string;
}

/**
 * The media X of the vertical line: the pointer's, unless the pointer is over
 * an empty slot; then the point the tooltip and the pill name, so all three agree.
 */
export function crosshairLineX(chart: ChartInstance, pos: CrosshairPosition): number {
  const pointTime = hoveredPointTime(chart, pos.time);
  if (pointTime === null) return pos.mediaX;

  const inPointSlot = Math.abs(pointTime - pos.time) <= chart.getDataInterval() / 2;
  if (inPointSlot) return pos.mediaX;

  return chart.plotLeft + chart.timeScale.timeToX(pointTime);
}

export function crosshairXLabel(chart: ChartInstance, pos: CrosshairPosition): CrosshairXLabel {
  const left = crosshairLineX(chart, pos);
  const right = chart.getMediaSize().width - left;
  // Centred on the tick label row, so it covers the label under it; flush to the floor with no X axis.
  const bottom = chart.xAxisHeight / 2;

  // CSS clamps in the pill's own width: shifted inward near an edge instead of cut.
  const shiftX = `clamp(${-left}px, -50%, calc(${right}px - 100%))`;
  const shiftY = bottom > 0 ? '50%' : '0px';

  return { text: crosshairXText(chart, pos), left, bottom, transform: `translate(${shiftX}, ${shiftY})` };
}

function crosshairXText(chart: ChartInstance, pos: CrosshairPosition): string {
  const scale = chart.timeScale;
  const dataInterval = chart.getDataInterval();
  // The axis's tick granularity: a time-of-day pill would float among date labels when zoomed out.
  const tickInterval = scale.niceTickValues(dataInterval).tickInterval || dataInterval;
  // Within a day, the data's own precision: 5-second candles keep their seconds under minute ticks.
  const intraday = scale.getType() === 'time' && scale.getFormat() === null && tickInterval < DAY;
  const interval = intraday ? Math.min(tickInterval, dataInterval) : tickInterval;

  // The point the tooltip names, not the pointer, so the two agree.
  const snapshots = buildHoverSnapshots(chart, { time: pos.time, cacheKey: 'crosshair' });
  if (snapshots.length > 0) return formatHeaderX(chart, { time: pos.time, snapshots, interval });

  // No point near: a numeric pointer position to the precision of one pixel, not of the tick step.
  const step = scale.getType() === 'numeric' ? scale.pixelDeltaToTimeDelta(1) : interval;

  return scale.formatX(pos.time, step);
}
