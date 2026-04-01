import type { ChartTheme } from "../../theme/types";
import type { BitmapCoordinateSpace } from "../canvas-manager";

export function renderCrosshair(
  scope: BitmapCoordinateSpace,
  bitmapX: number,
  bitmapY: number,
  theme: ChartTheme,
): void {
  const { context, bitmapSize, horizontalPixelRatio } = scope;

  context.strokeStyle = theme.crosshair.color;
  context.lineWidth = 1;
  context.setLineDash([4 * horizontalPixelRatio, 4 * horizontalPixelRatio]);

  const x = Math.round(bitmapX) + 0.5;
  const y = Math.round(bitmapY) + 0.5;

  context.beginPath();
  context.moveTo(x, 0);
  context.lineTo(x, bitmapSize.height);
  context.stroke();

  context.beginPath();
  context.moveTo(0, y);
  context.lineTo(bitmapSize.width, y);
  context.stroke();

  context.setLineDash([]);
}
