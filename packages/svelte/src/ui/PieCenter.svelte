<script lang="ts">
import type { ChartInstance, HoverInfo, PieHole, SliceInfo, ValueFormatter } from '@wick-charts/core';
import { formatCompact, pieCenterBox, pieCenterText, pieCenterValueFontSize, pieTotal } from '@wick-charts/core';
import { onDestroy } from 'svelte';

import { getChartContext } from '../context.js';
import SnippetSlot from '../SnippetSlot.svelte';
import type { PieCenterRenderContext } from './types.js';

/** Svelte 5: the default slot's snippet passed as a prop (`children={snippet}`) rather than nested. */
export let children: unknown = undefined;

/**
 * Owning series id. **Optional** — when omitted, the first visible pie
 * series is picked.
 */
export let seriesId: string | undefined = undefined;
/** Caption under the total, e.g. `'Total sessions'`. Default: none. */
export let label: string | undefined = undefined;
/** Formatter for the total and the hovered value. Default: shared `formatCompact`. */
export let format: ValueFormatter = formatCompact;
/** Show the hovered slice instead of the total while the pointer is on a slice. Default `true`. */
export let followHover: boolean = true;

// biome-ignore lint/correctness/noUnusedVariables: svelte2tsx reads it to type the slot
interface $$Slots {
  default: PieCenterRenderContext;
}

const chartStore = getChartContext();

let bump = 0;
let unsubscribe: (() => void) | null = null;

$: {
  const c = $chartStore;
  if (c && !unsubscribe) {
    const handler = () => {
      bump++;
    };
    c.on('overlayChange', handler);
    c.on('seriesHover', handler);
    if (c.getSeriesIds().length > 0) bump++;
    unsubscribe = () => {
      c.off('overlayChange', handler);
      c.off('seriesHover', handler);
    };
  }
}

onDestroy(() => {
  unsubscribe?.();
});

function resolvePieSeriesId(c: ChartInstance, explicit: string | undefined): string | null {
  if (explicit !== undefined) return explicit;

  const pies = c.getSeriesIdsByType('pie', { visibleOnly: true });

  return pies.length > 0 ? pies[0] : null;
}

$: chart = $chartStore;
$: resolvedId = chart && bump >= 0 ? resolvePieSeriesId(chart, seriesId) : null;
$: hole = chart && resolvedId !== null && bump >= 0 ? chart.getPieHole(resolvedId) : (null as PieHole | null);
$: slices = ((chart && resolvedId !== null && bump >= 0 ? chart.getSliceInfo(resolvedId) : null) ??
  []) as readonly SliceInfo[];
$: theme = chart && bump >= 0 ? chart.getTheme() : null;
$: box = hole && theme ? pieCenterBox(hole, theme) : null;
$: hovered =
  chart && resolvedId !== null && followHover && bump >= 0
    ? chart.getHoverInfo(resolvedId)
    : (null as HoverInfo | null);
$: total = pieTotal(slices);
$: text = pieCenterText({ slices, hovered, format, label });
</script>

{#if box && hole && theme && slices.length > 0}
  <div
    data-chart-pie-center=""
    style="position:absolute;left:{box.left}px;top:{box.top}px;width:{box.size}px;height:{box.size}px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;overflow:hidden;pointer-events:none;font-family:{theme.typography.fontFamily};font-size:{theme.typography.fontSize}px;color:{theme.tooltip.textColor};"
  >
    {#if $$slots.default}
      <slot {total} {slices} {hovered} {format} {hole}>
        <SnippetSlot snippet={children} props={{ total, slices, hovered, format, hole }} />
      </slot>
    {:else}
      <div style="font-size:{pieCenterValueFontSize(box, text.value)}px;font-weight:600;line-height:1.1;white-space:nowrap;">
        {text.value}
      </div>
      {#if text.caption}
        <div style="font-size:{box.captionFontSize}px;opacity:0.6;margin-top:2px;line-height:1.2;">{text.caption}</div>
      {/if}
    {/if}
  </div>
{/if}
