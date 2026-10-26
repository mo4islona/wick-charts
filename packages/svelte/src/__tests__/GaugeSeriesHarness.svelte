<script lang="ts">
import type { ChartInstance, GaugeZone, PieSliceInput } from '@wick-charts/core';
import { ChartContainer, GaugeSeries, PieLegend, RadialProgressSeries, catppuccin } from '@wick-charts/svelte';

import ChartProbe from './ChartProbe.svelte';

export let value = 0;
export let rings: PieSliceInput[] = [];
export let zones: GaugeZone[] = [];
export let show = true;
export let onChart: (chart: ChartInstance) => void = () => {};
</script>

<ChartContainer theme={catppuccin.theme}>
  <ChartProbe {onChart} />
  {#if show}
    <GaugeSeries id="load" {value} options={{ zones }} />
    <RadialProgressSeries id="rings" data={rings} />
    <PieLegend mode="percent" />
  {/if}
</ChartContainer>
