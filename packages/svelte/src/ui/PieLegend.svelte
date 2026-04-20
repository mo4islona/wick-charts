<script lang="ts">
import { type ChartInstance, type SliceInfo, type ValueFormatter, formatCompact } from '@wick-charts/core';
import { onDestroy } from 'svelte';

import { getChartContext, getThemeContext } from '../context';

type PieLegendMode = 'value' | 'percent';

/**
 * Owning series id. **Optional** — when omitted, the first visible pie
 * series is picked.
 */
export let seriesId: string | undefined = undefined;
/** Display mode: 'value' shows absolute + percent, 'percent' shows only percent. */
export let mode: PieLegendMode | undefined = undefined;
/** Custom formatter for the absolute slice value. */
export let format: ValueFormatter | undefined = undefined;

$: resolvedMode = (mode ?? 'value') as PieLegendMode;
$: resolvedFormat = (format ?? formatCompact) as ValueFormatter;

const chartStore = getChartContext();
const themeStore = getThemeContext();

let bump = 0;
let overlayUnsub: (() => void) | null = null;

$: {
  const c = $chartStore;
  if (c && !overlayUnsub) {
    const handler = () => {
      bump++;
    };
    c.on('overlayChange', handler);
    overlayUnsub = () => c.off('overlayChange', handler);
    if (c.getSeriesIds().length > 0) bump++;
  }
}

onDestroy(() => {
  overlayUnsub?.();
});

function resolvePieSeriesId(c: ChartInstance, explicit: string | undefined): string | null {
  if (explicit !== undefined) return explicit;

  const pies = c.getSeriesIdsByType('pie', { visibleOnly: true });

  return pies.length > 0 ? pies[0] : null;
}

$: chart = $chartStore;
$: theme = $themeStore;
$: resolvedId = chart && bump >= 0 ? resolvePieSeriesId(chart, seriesId) : null;
$: slices = ((chart && resolvedId !== null ? chart.getSliceInfo(resolvedId) : null) ?? []) as readonly SliceInfo[];
</script>

{#if slices.length > 0 && theme}
  {#if $$slots.default}
    <slot slices={slices} mode={resolvedMode} format={resolvedFormat} />
  {:else}
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
            style="opacity:{resolvedMode === 'percent'
              ? 1
              : 0.5};font-weight:{resolvedMode === 'percent'
              ? 600
              : 400};font-size:{resolvedMode === 'percent'
              ? theme.typography.fontSize
              : theme.typography.axisFontSize}px;font-variant-numeric:tabular-nums;min-width:40px;text-align:right;"
          >
            {slice.percent.toFixed(1)}%
          </span>
        </div>
      {/each}
    </div>
  {/if}
{/if}
