<script lang="ts">
import type { ChartInstance } from '@wick-charts/core';
import { ChartContainer, PieCenter, PieSeries } from '@wick-charts/svelte';

import ChartProbe from './ChartProbe.svelte';

export let variant: 'default' | 'slot' = 'default';
export let onChart: (chart: ChartInstance) => void = () => {};

const slices = [
  { label: 'A', value: 25 },
  { label: 'B', value: 75 },
];
const donut = { innerRadiusRatio: 0.6, sliceLabels: { mode: 'none' as const } };
const format = (v: number) => `${v} visits`;
</script>

<ChartContainer>
  <ChartProbe {onChart} />
  <PieSeries id="pie" data={slices} options={donut} />
  {#if variant === 'slot'}
    <PieCenter let:total let:slices={rows} let:hole>
      <span data-probe="">{`${total}|${rows.length}|${hole.innerRadius > 0}`}</span>
    </PieCenter>
  {:else}
    <PieCenter label="Total sessions" {format} />
  {/if}
</ChartContainer>
