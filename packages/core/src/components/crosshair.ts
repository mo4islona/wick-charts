import type { BitmapCoordinateSpace } from '../canvas-manager';
import type { ChartTheme } from '../theme/types';

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
}

export function renderCrosshair(args: CrosshairRenderArgs): void {
  const { scope, bitmapX, bitmapY, theme, pane, leftOverhang = 0 } = args;
  const { context, bitmapSize, horizontalPixelRatio, verticalPixelRatio } = scope;

  const drawVertical = bitmapX >= 0 && bitmapX <= pane.width;
  const drawHorizontal = bitmapY <= pane.height;
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
