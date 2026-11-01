<script lang="ts">
import type { ChartInstance, RadarLayer, RadarSeriesOptions } from '@wick-charts/core';
import { ChartContainer, Legend, RadarSeries, RadarTooltip, catppuccin } from '@wick-charts/svelte';

import ChartProbe from './ChartProbe.svelte';

export let axes: string[] = [];
export let data: RadarLayer[] = [];
export let options: Partial<RadarSeriesOptions> = {};
export let show = true;
export let onChart: (chart: ChartInstance) => void = () => {};
</script>

<ChartContainer theme={catppuccin.theme}>
  <ChartProbe {onChart} />
  {#if show}
    <RadarSeries id="skills" {axes} {data} {options} />
    <RadarTooltip />
    <Legend />
  {/if}
</ChartContainer>
