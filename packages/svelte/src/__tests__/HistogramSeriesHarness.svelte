<script lang="ts">
import type { ChartInstance, HistogramData, HistogramSeriesOptions } from '@wick-charts/core';
import { ChartContainer, HistogramSeries, Legend } from '@wick-charts/svelte';

import ChartProbe from './ChartProbe.svelte';

export let data: HistogramData = [];
export let options: Partial<HistogramSeriesOptions> = {};
export let onChart: (chart: ChartInstance) => void = () => {};
</script>

<ChartContainer axis={{ x: { type: 'numeric' } }}>
  <ChartProbe {onChart} />
  <HistogramSeries id="h" {data} {options} />
  <Legend />
</ChartContainer>
