<script lang="ts">
import type { TimePoint } from '@wick-charts/core';
import { ChartContainer, LineSeries, TimeRegion, catppuccin } from '@wick-charts/svelte';

export let lineData: TimePoint[][] = [[]];
export let regionTo = 3;
export let showRegion = true;
</script>

<ChartContainer theme={catppuccin.theme}>
  <LineSeries data={lineData} id="m" options={{ pulse: false }} />
  {#if showRegion}
    <TimeRegion from={2} to={regionTo} fill="rgba(240, 85, 106, 0.08)" label="window" />
  {/if}
</ChartContainer>
