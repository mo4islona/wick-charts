<script lang="ts">
import type { OHLCInput, TimePoint } from '@wick-charts/core';
import {
  BarSeries,
  CandlestickSeries,
  ChartContainer,
  LineSeries,
  Tooltip,
  TooltipLegend,
  darkTheme,
} from '@wick-charts/svelte';

/**
 * Variants exercise the tooltip / tooltip-legend parity fixes:
 *   - `ordered-legend` : TooltipLegend mounted *before* the series in the
 *     slot, to prove seriesChange catch-up works.
 *   - `layered-legend` : TooltipLegend over a multi-layer BarSeries to prove
 *     getLayerSnapshots expansion fires.
 *   - `ordered-tooltip`: Tooltip before series, sanity check it doesn't crash
 *     on initial empty series list.
 *   - `precision-legend`: TooltipLegend over sub-cent OHLC — regression guard
 *     for the old hardcoded `.toFixed(2)`.
 *   - `custom-format-legend`: TooltipLegend with a custom `format` prop.
 */
export let variant:
  | 'ordered-legend'
  | 'layered-legend'
  | 'ordered-tooltip'
  | 'precision-legend'
  | 'custom-format-legend' = 'ordered-legend';
export let candlestickData: OHLCInput[] = [];
export let barData: TimePoint[][] = [[]];
export let lineData: TimePoint[][] = [[]];
</script>

<ChartContainer theme={darkTheme}>
  {#if variant === 'ordered-legend'}
    <TooltipLegend />
    <CandlestickSeries data={candlestickData} />
  {:else if variant === 'layered-legend'}
    <TooltipLegend />
    <BarSeries data={barData} />
  {:else if variant === 'ordered-tooltip'}
    <Tooltip />
    <CandlestickSeries data={candlestickData} />
  {:else if variant === 'precision-legend'}
    <TooltipLegend />
    <CandlestickSeries data={candlestickData} />
  {:else if variant === 'custom-format-legend'}
    <TooltipLegend format={(v, field) => `<${field}:${v}>`} />
    <LineSeries data={lineData} />
  {/if}
</ChartContainer>
