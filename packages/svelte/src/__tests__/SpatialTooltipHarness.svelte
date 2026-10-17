<script lang="ts">
import type { ChartInstance } from '@wick-charts/core';
import { ChartContainer, HeatmapSeries, HeatmapTooltip, PieSeries, PieTooltip } from '@wick-charts/svelte';

import ChartProbe from './ChartProbe.svelte';

export let variant: 'pie' | 'heatmap' = 'pie';
export let onChart: (chart: ChartInstance) => void = () => {};

const slices = [
  { label: 'Alpha', value: 40 },
  { label: 'Beta', value: 60 },
];

const cells = [
  { x: 'Mon', y: 'AM', value: 1 },
  { x: 'Tue', y: 'AM', value: 2 },
  { x: 'Mon', y: 'PM', value: 3 },
  { x: 'Tue', y: 'PM', value: 4 },
];
</script>

<ChartContainer>
  <ChartProbe {onChart} />
  {#if variant === 'pie'}
    <PieSeries data={slices} />
    <PieTooltip />
  {:else}
    <HeatmapSeries data={cells} />
    <HeatmapTooltip />
  {/if}
</ChartContainer>
