import type { BitmapCoordinateSpace } from '../canvas-manager';
import type { TimeScale } from '../scales/time-scale';
import type { YScale } from '../scales/y-scale';
import type { ChartTheme } from '../theme/types';

export function renderGrid(
  scope: BitmapCoordinateSpace,
  timeScale: TimeScale,
  yScale: YScale,
  theme: ChartTheme,
  dataInterval: number,
): void {
  const { context, bitmapSize, horizontalPixelRatio, verticalPixelRatio } = scope;

  context.strokeStyle = theme.grid.color;
  context.lineWidth = 1;

  if (theme.grid.style === 'dashed') {
    context.setLineDash([4 * horizontalPixelRatio, 4 * horizontalPixelRatio]);
  } else if (theme.grid.style === 'dotted') {
    context.setLineDash([1 * horizontalPixelRatio, 3 * horizontalPixelRatio]);
  }

  const yTicks = yScale.niceTickValues();
  context.beginPath();
  for (const value of yTicks) {
    const y = Math.round(yScale.valueToBitmapY(value)) + 0.5;
    context.moveTo(0, y);
    context.lineTo(bitmapSize.width, y);
  }
  context.stroke();

  const { ticks: timeTicks } = timeScale.niceTickValues(dataInterval);
  context.beginPath();
  for (const time of timeTicks) {
    const x = Math.round(timeScale.timeToBitmapX(time)) + 0.5;
    context.moveTo(x, 0);
    context.lineTo(x, bitmapSize.height);
  }
  context.stroke();

  context.setLineDash([]);
}
