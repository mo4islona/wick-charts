<script lang="ts">
import type { LineSeriesOptions, OHLCInput, PieSliceData, TimePoint } from '@wick-charts/core';
import { BarSeries, CandlestickSeries, ChartContainer, LineSeries, PieSeries, catppuccin } from '@wick-charts/svelte';

export let variant: 'candlestick' | 'line' | 'bar' | 'pie' | 'empty' = 'empty';
export let candlestickData: OHLCInput[] = [];
export let lineData: TimePoint[][] = [[]];
export let lineOptions: Partial<LineSeriesOptions> | undefined = undefined;
export let barData: TimePoint[][] = [[]];
export let pieData: PieSliceData[] = [];
</script>

<ChartContainer theme={catppuccin.theme}>
  {#if variant === 'candlestick'}
    <CandlestickSeries data={candlestickData} />
  {:else if variant === 'line'}
    <LineSeries data={lineData} options={lineOptions} />
  {:else if variant === 'bar'}
    <BarSeries data={barData} />
  {:else if variant === 'pie'}
    <PieSeries data={pieData} />
  {/if}
</ChartContainer>
