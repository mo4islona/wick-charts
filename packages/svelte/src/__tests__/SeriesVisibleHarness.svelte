<script lang="ts">
import type { ChartInstance, HeatmapCellData, OHLCInput, PieSliceData, TimePoint } from '@wick-charts/core';
import {
  CandlestickSeries,
  ChartContainer,
  HeatmapSeries,
  LineSeries,
  PieSeries,
  catppuccin,
} from '@wick-charts/svelte';

export let kind: 'line' | 'candlestick' | 'heatmap' | 'pie' = 'line';
export let lineData: TimePoint[][] = [[]];
export let candlestickData: OHLCInput[] = [];
export let heatmapData: HeatmapCellData[] = [];
export let pieData: PieSliceData[] = [];
export let visible = true;
export let onReady: ((chart: ChartInstance) => void) | undefined = undefined;
</script>

<ChartContainer theme={catppuccin.theme} {onReady}>
  {#if kind === 'line'}
    <LineSeries id="s" data={lineData} {visible} />
  {:else if kind === 'candlestick'}
    <CandlestickSeries id="s" data={candlestickData} {visible} />
  {:else if kind === 'heatmap'}
    <HeatmapSeries id="s" data={heatmapData} {visible} />
  {:else if kind === 'pie'}
    <PieSeries id="s" data={pieData} {visible} />
  {/if}
</ChartContainer>
