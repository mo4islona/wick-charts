import type { ChartTheme } from '../theme/types';
import type { BitmapCoordinateSpace } from '../canvas-manager';
import type { YScale } from '../scales/y-scale';
import type { TimeScale } from '../scales/time-scale';

export interface SeriesRenderContext {
  scope: BitmapCoordinateSpace;
  timeScale: TimeScale;
  yScale: YScale;
  theme: ChartTheme;
  dataInterval: number;
}

export interface SeriesRenderer {
  render(ctx: SeriesRenderContext): void;
  /** Optional: return the effective min/max for auto-range (e.g. stacked totals). */
  getValueRange?(from: number, to: number): { min: number; max: number } | null;
}
