<script lang="ts">
import { type ValueFormatter, formatCompact } from '@wick-charts/core';
import { onDestroy } from 'svelte';

import { getChartContext, getThemeContext } from '../context';
import { createLastYValue } from '../stores';

export let seriesId: string;
/** Display mode: 'value' shows absolute + percent, 'percent' shows only percent. */
export let mode: 'value' | 'percent' | undefined = undefined;
/** Custom formatter for the absolute slice value. */
export let format: ValueFormatter | undefined = undefined;

$: resolvedMode = (mode ?? 'value') as 'value' | 'percent';
$: resolvedFormat = (format ?? formatCompact) as ValueFormatter;

const chartStore = getChartContext();
const themeStore = getThemeContext();
let lastValue: { value: number; isLive: boolean } | null = null;
let unsub: (() => void) | null = null;

$: {
  const chart = $chartStore;
  if (chart && !unsub) {
    const store = createLastYValue(chart, seriesId);
    unsub = store.subscribe((v) => {
      lastValue = v;
    });
  }
}

onDestroy(() => {
  unsub?.();
});

$: chart = $chartStore;
$: theme = $themeStore;
// Reference lastValue to trigger reactivity on dataUpdate events
$: slices = (void lastValue, chart?.getSliceInfo(seriesId) ?? []);
</script>

{#if slices.length > 0 && theme}
  <div
    style="display:flex;flex-direction:column;gap:6px;padding:8px 12px;font-family:{theme.typography.fontFamily};font-size:{theme.typography.fontSize}px;color:{theme.tooltip.textColor};pointer-events:auto;"
  >
    {#each slices as slice, i (i)}
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="width:10px;height:10px;border-radius:50%;background:{slice.color};flex-shrink:0;" />
        <span style="flex:1;opacity:0.8;">{slice.label}</span>
        {#if resolvedMode === 'value'}
          <span style="font-weight:600;font-variant-numeric:tabular-nums;">{resolvedFormat(slice.value)}</span>
        {/if}
        <span
          style="opacity:{resolvedMode === 'percent' ? 1 : 0.5};font-weight:{resolvedMode === 'percent' ? 600 : 400};font-size:{resolvedMode === 'percent' ? theme.typography.fontSize : theme.typography.axisFontSize}px;font-variant-numeric:tabular-nums;min-width:40px;text-align:right;"
        >
          {slice.percent.toFixed(1)}%
        </span>
      </div>
    {/each}
  </div>
{/if}
