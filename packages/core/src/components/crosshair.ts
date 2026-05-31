import type { BitmapCoordinateSpace } from '../canvas-manager';
import type { ChartTheme } from '../theme/types';

export function renderCrosshair(
  scope: BitmapCoordinateSpace,
  bitmapX: number,
  bitmapY: number,
  theme: ChartTheme,
): void {
  const { context, bitmapSize, horizontalPixelRatio, verticalPixelRatio } = scope;

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

  context.beginPath();
  context.moveTo(x, 0);
  context.lineTo(x, bitmapSize.height);
  context.moveTo(0, y);
  context.lineTo(bitmapSize.width, y);
  context.stroke();

  context.setLineDash([]);
}
