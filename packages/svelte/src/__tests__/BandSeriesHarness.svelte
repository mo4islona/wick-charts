<script lang="ts">
import type { BandData, ChartInstance } from '@wick-charts/core';
import { BandSeries, ChartContainer, catppuccin } from '@wick-charts/svelte';

import ChartProbe from './ChartProbe.svelte';

export let data: BandData = [];
export let show = true;
export let onChart: (chart: ChartInstance) => void = () => {};
</script>

<ChartContainer theme={catppuccin.theme}>
  <ChartProbe {onChart} />
  {#if show}
    <BandSeries id="band" {data} />
  {/if}
</ChartContainer>
