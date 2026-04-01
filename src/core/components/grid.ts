import type { ChartTheme } from "../../theme/types";
import type { BitmapCoordinateSpace } from "../canvas-manager";
import type { PriceScale } from "../scales/price-scale";
import type { TimeScale } from "../scales/time-scale";

export function renderGrid(
  scope: BitmapCoordinateSpace,
  timeScale: TimeScale,
  priceScale: PriceScale,
  theme: ChartTheme,
  dataInterval: number,
): void {
  const { context, bitmapSize, horizontalPixelRatio, verticalPixelRatio } = scope;

  context.strokeStyle = theme.grid.color;
  context.lineWidth = 1;

  if (theme.grid.style === "dashed") {
    context.setLineDash([4 * horizontalPixelRatio, 4 * horizontalPixelRatio]);
  } else if (theme.grid.style === "dotted") {
    context.setLineDash([1 * horizontalPixelRatio, 3 * horizontalPixelRatio]);
  }

  const priceTicks = priceScale.niceTickValues();
  for (const price of priceTicks) {
    const y = Math.round(priceScale.priceToBitmapY(price)) + 0.5;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(bitmapSize.width, y);
    context.stroke();
  }

  const timeTicks = timeScale.niceTickValues(dataInterval);
  for (const time of timeTicks) {
    const x = Math.round(timeScale.timeToBitmapX(time)) + 0.5;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, bitmapSize.height);
    context.stroke();
  }

  context.setLineDash([]);
}
