<script lang="ts">
import type { TimePoint } from '@wick-charts/core';
import { ChartContainer, LineSeries, ReferenceLine, catppuccin } from '@wick-charts/svelte';

export let lineData: TimePoint[][] = [[]];
export let lineValue = 40;
export let showLine = true;
</script>

<ChartContainer theme={catppuccin.theme}>
  <LineSeries data={lineData} id="m" options={{ pulse: false }} />
  {#if showLine}
    <ReferenceLine value={lineValue} label="alert" color="#f0556a" />
  {/if}
</ChartContainer>
