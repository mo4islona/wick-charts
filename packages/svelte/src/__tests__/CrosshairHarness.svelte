<script lang="ts">
import type { ChartInstance, TimePoint } from '@wick-charts/core';
import { ChartContainer, Crosshair, LineSeries, catppuccin } from '@wick-charts/svelte';

import ChartProbe from './ChartProbe.svelte';

export let lineData: TimePoint[][] = [[]];
export let onChart: (chart: ChartInstance) => void = () => {};
</script>

<ChartContainer theme={catppuccin.theme}>
  <ChartProbe {onChart} />
  <LineSeries id="line-id" data={lineData} />
  <Crosshair />
</ChartContainer>
