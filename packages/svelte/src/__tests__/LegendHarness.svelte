<script lang="ts">
import type { TimePoint } from '@wick-charts/core';
import { BarSeries, ChartContainer, Legend, LineSeries, darkTheme } from '@wick-charts/svelte';

/**
 * Variants exercise the Legend parity behaviors:
 *   - `ordered-line`   : Legend before LineSeries, to prove seriesChange
 *     catch-up kicks in when Legend mounts before the series registers.
 *   - `toggle-line`    : Series then Legend, default `toggle` mode.
 *   - `solo-bars`      : Three-layer BarSeries with `mode="solo"` Legend.
 *   - `right-position` : Legend with `position="right"` — teleports into the
 *     right-side anchor instead of the bottom one.
 */
export let variant: 'ordered-line' | 'toggle-line' | 'solo-bars' | 'right-position' = 'ordered-line';
export let lineData: TimePoint[][] = [[]];
export let barData: TimePoint[][] = [[]];
</script>

<ChartContainer theme={darkTheme}>
  {#if variant === 'ordered-line'}
    <Legend />
    <LineSeries data={lineData} />
  {:else if variant === 'toggle-line'}
    <LineSeries data={lineData} />
    <Legend />
  {:else if variant === 'solo-bars'}
    <BarSeries data={barData} />
    <Legend mode="solo" />
  {:else if variant === 'right-position'}
    <LineSeries data={lineData} />
    <Legend position="right" />
  {/if}
</ChartContainer>
