<script lang="ts">
import type { BandData, ChartInstance, MultiLayerData } from '@wick-charts/core';
import { BandSeries, BarSeries, ChartContainer, LineSeries } from '@wick-charts/svelte';

import ChartProbe from './ChartProbe.svelte';

export let kind: 'line' | 'bar' | 'band' = 'line';
export let data: MultiLayerData = [];
export let bandData: BandData = [];
export let onChart: (chart: ChartInstance) => void = () => {};
</script>

<ChartContainer>
  <ChartProbe {onChart} />
  {#if kind === 'line'}
    <LineSeries id="s" {data} />
  {:else if kind === 'bar'}
    <BarSeries id="s" {data} />
  {:else}
    <BandSeries id="s" data={bandData} />
  {/if}
</ChartContainer>
