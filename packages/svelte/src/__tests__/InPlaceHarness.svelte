<script lang="ts">
import type { ChartInstance, OHLCInput } from '@wick-charts/core';
import { CandlestickSeries, ChartContainer } from '@wick-charts/svelte';

import ChartProbe from './ChartProbe.svelte';

export let data: OHLCInput[] = [];
export let onChart: (chart: ChartInstance) => void = () => {};
</script>

<ChartContainer>
  <ChartProbe {onChart} />
  <CandlestickSeries id="cs" {data} />
</ChartContainer>
