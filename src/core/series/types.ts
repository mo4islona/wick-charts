import type { ChartTheme } from "../../theme/types";
import type { BitmapCoordinateSpace } from "../canvas-manager";
import type { PriceScale } from "../scales/price-scale";
import type { TimeScale } from "../scales/time-scale";

export interface SeriesRenderContext {
  scope: BitmapCoordinateSpace;
  timeScale: TimeScale;
  priceScale: PriceScale;
  theme: ChartTheme;
  dataInterval: number;
}

export interface SeriesRenderer {
  render(ctx: SeriesRenderContext): void;
}
