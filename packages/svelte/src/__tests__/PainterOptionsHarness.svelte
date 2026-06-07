<script lang="ts">
import type { BarSeriesOptions, LineSeriesOptions, TimePoint } from '@wick-charts/core';
import { BarSeries, ChartContainer, LineSeries, catppuccin } from '@wick-charts/svelte';

// Test harness for PR6 — passes a reassignable `options` object to a series so a
// spec can `$set({ options })` and assert the new painter/cornerRadius/curve
// reaches the renderer.
export let variant: 'bar' | 'line' = 'bar';
export let data: TimePoint[][] = [[]];
export let options: Partial<BarSeriesOptions> & Partial<LineSeriesOptions> = {};
</script>

<ChartContainer theme={catppuccin.theme}>
  {#if variant === 'bar'}
    <BarSeries {data} {options} />
  {:else}
    <LineSeries {data} {options} />
  {/if}
</ChartContainer>
