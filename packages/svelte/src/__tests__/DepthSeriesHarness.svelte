<script lang="ts">
import type { ChartInstance, DepthLevel } from '@wick-charts/core';
import { ChartContainer, DepthSeries, catppuccin } from '@wick-charts/svelte';

import ChartProbe from './ChartProbe.svelte';

export let bids: DepthLevel[] = [];
export let asks: DepthLevel[] = [];
export let show = true;
export let onChart: (chart: ChartInstance) => void = () => {};
</script>

<ChartContainer theme={catppuccin.theme} axis={{ x: { type: 'numeric' } }}>
  <ChartProbe {onChart} />
  {#if show}
    <DepthSeries id="book" {bids} {asks} />
  {/if}
</ChartContainer>
