<script lang="ts">
import type { OHLCInput, TimePoint } from '@wick-charts/core';
import {
  BarSeries,
  CandlestickSeries,
  ChartContainer,
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
 */
export let variant: 'ordered-legend' | 'layered-legend' | 'ordered-tooltip' = 'ordered-legend';
export let candlestickData: OHLCInput[] = [];
export let barData: TimePoint[][] = [[]];
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
  {/if}
</ChartContainer>
