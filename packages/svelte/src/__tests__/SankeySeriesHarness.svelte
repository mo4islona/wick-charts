<script lang="ts">
import type { ChartInstance, SankeyLink, SankeyNode } from '@wick-charts/core';
import { ChartContainer, SankeySeries, SankeyTooltip, catppuccin } from '@wick-charts/svelte';

import ChartProbe from './ChartProbe.svelte';

export let nodes: SankeyNode[] = [];
export let links: SankeyLink[] = [];
export let show = true;
export let onChart: (chart: ChartInstance) => void = () => {};
</script>

<ChartContainer theme={catppuccin.theme}>
  <ChartProbe {onChart} />
  {#if show}
    <SankeySeries id="flow" {nodes} {links} />
    <SankeyTooltip />
  {/if}
</ChartContainer>
