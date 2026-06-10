import type { ChartTheme } from '../theme/types';
import type { SeriesType } from '../types';
import type { SeriesRenderer } from './types';

/** Environment the chart hands a {@link SeriesDefinition} when constructing its renderer. */
export interface SeriesCreateEnv {
  /** Active chart theme — definitions read their default colours from it. */
  theme: ChartTheme;
  /** Number of stacked layers requested via `layers` (`1` when omitted). */
  layerCount: number;
}

/**
 * A series type the chart knows how to instantiate.
 *
 * Pass one to `chart.addSeries(def, options)` — the chart itself stays
 * renderer-agnostic, so bundlers only ship the series a host actually
 * imports. The built-in definitions live next to their renderers
 * (`CandlestickSeriesDef`, `LineSeriesDef`, `BarSeriesDef`, `PieSeriesDef`).
 */
export interface SeriesDefinition<O = Record<string, unknown>> {
  /** Discriminator for animation defaults and string-form lookup. */
  readonly type: SeriesType;
  /** Construct the renderer. `options` arrives with the chart's animation defaults/overrides already merged. */
  create(env: SeriesCreateEnv, options: Partial<O>): SeriesRenderer;
}

const registry = new Map<SeriesType, SeriesDefinition>();

/**
 * Make a definition resolvable through the string form
 * `chart.addSeries('line', …)`. The built-ins register in one call via
 * `registerBuiltinSeries()`; hosts that pass definitions directly never
 * need the registry.
 */
export function registerSeriesDefinition(def: SeriesDefinition): void {
  registry.set(def.type, def);
}

/** Look up a registered definition for the string form of `addSeries`. */
export function resolveSeriesDefinition(type: SeriesType): SeriesDefinition | undefined {
  return registry.get(type);
}
