import { BarSeriesDef } from './bar';
import { CandlestickSeriesDef } from './candlestick';
import { registerSeriesDefinition } from './definition';
import { HeatmapSeriesDef } from './heatmap';
import { LineSeriesDef } from './line';
import { PieSeriesDef } from './pie';

/**
 * Register the five built-in series so the string form
 * `chart.addSeries('line', …)` resolves. Call it once at startup.
 *
 * Importing this helper pulls every renderer into the bundle — hosts that
 * care about size should pass definitions directly instead:
 * `chart.addSeries(LineSeriesDef, options)`.
 */
export function registerBuiltinSeries(): void {
  registerSeriesDefinition(CandlestickSeriesDef);
  registerSeriesDefinition(LineSeriesDef);
  registerSeriesDefinition(BarSeriesDef);
  registerSeriesDefinition(PieSeriesDef);
  registerSeriesDefinition(HeatmapSeriesDef);
}
