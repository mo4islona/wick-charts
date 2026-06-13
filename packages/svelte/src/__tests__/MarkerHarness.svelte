<script lang="ts">
import type { TimePoint } from '@wick-charts/core';
import { ChartContainer, LineSeries, Marker, catppuccin } from '@wick-charts/svelte';

export let lineData: TimePoint[][] = [[]];
export let markerValue = 50;
export let showMarker = true;
</script>

<ChartContainer theme={catppuccin.theme}>
  <LineSeries data={lineData} id="m" options={{ pulse: false }} />
  {#if showMarker}
    <Marker time={3} value={markerValue} label="broke" color="#f0556a" />
  {/if}
</ChartContainer>
