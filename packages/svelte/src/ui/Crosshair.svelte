<script lang="ts">
import type { ChartInstance, CrosshairPosition, YAxisPosition } from '@wick-charts/core';
import { onDestroy } from 'svelte';

import { axisLabelCover } from '../axis-label-cover.js';
import { getChartContext } from '../context.js';
import { createCrosshairPosition } from '../stores.js';
import NumberText from './NumberText.svelte';

const chartStore = getChartContext();
let position: CrosshairPosition | null = null;
let unsubscribe: (() => void) | null = null;

// `setTheme` fires `overlayChange`; reading `bump` in the theme reactive
// keeps label colors live across runtime theme swaps instead of freezing on
// the first-render snapshot (matches Tooltip/PieTooltip).
let bump = 0;
let overlayUnsub: (() => void) | null = null;

$: {
  const chart = $chartStore;
  if (chart && !unsubscribe) {
    const posStore = createCrosshairPosition(chart);
    unsubscribe = posStore.subscribe((v) => {
      position = v;
    });
  }
  if (chart && !overlayUnsub) {
    const handler = () => {
      bump++;
    };
    chart.on('overlayChange', handler);
    overlayUnsub = () => chart.off('overlayChange', handler);
  }
}

onDestroy(() => {
  unsubscribe?.();
  overlayUnsub?.();
});

$: chart = $chartStore;
$: theme = chart && bump >= 0 ? chart.getTheme() : null;
// Re-resolved on each crosshair move (a wheel-zoom re-emits it) and on `bump`: the chart
// reads the live range and data, which the chart ref alone doesn't track.
$: xLabel = chart && position && bump >= 0 ? chart.getCrosshairXLabel(position) : null;

// One value label per named scale's axis column, each read through its own scale.
// `_bump` re-runs these on `overlayChange`, re-labelling a still crosshair after a formatter or scale change.
function resolveScaleLabels(
  c: ChartInstance | null,
  pos: CrosshairPosition | null,
  _bump: number,
): { scale: string; position: YAxisPosition; text: string }[] {
  if (!c || !pos) return [];

  return c.getYScaleIds().flatMap((scale) => {
    const column = c.getYScaleColumn(scale);
    if (column === null) return [];

    const yScale = c.getYScale(scale);

    return [{ scale, position: column.position, text: yScale.formatY(yScale.yToValue(pos.mediaY)) }];
  });
}

$: scaleLabels = resolveScaleLabels(chart, position, bump);
$: defaultLabel = chart && position && bump >= 0 ? chart.yScale.formatY(position.y) : '';
// A named scale can own the default axis's side when the default axis is hidden.
$: defaultSideTaken = scaleLabels.some((label) => label.position === chart?.yAxisPosition);

// `zIndex:2` sits above axis ticks (z:0) but below the YLabel badge
// (z:3), so the live last-value stays visible when the crosshair crosses
// its row. `color-mix(...80%, transparent)` blends the solid theme color
// with 20% transparency so the axis grid shows through.
$: labelStyle = theme
  ? `background:color-mix(in srgb, ${theme.crosshair.labelBackground} 80%, transparent);color:${theme.crosshair.labelTextColor};font-size:${theme.axis.fontSize}px;font-family:${theme.typography.fontFamily};font-variant-numeric:tabular-nums;padding:2px 6px;border-radius:2px;white-space:nowrap;pointer-events:none;z-index:2;`
  : '';
</script>

{#if position && chart && theme}
  <!-- Y label on the value axis -->
  {#if !defaultSideTaken}
    <div
      use:axisLabelCover={{ chart, at: position }}
      style="position:absolute;{chart.yAxisPosition}:0;top:{position.mediaY}px;transform:translateY(-50%);{labelStyle}"
    >
      <NumberText text={defaultLabel} mute={false} />
    </div>
  {/if}
  {#each scaleLabels as label (label.scale)}
    <div
      use:axisLabelCover={{ chart, at: position }}
      style="position:absolute;{label.position}:0;top:{position.mediaY}px;transform:translateY(-50%);{labelStyle}"
    >
      <NumberText text={label.text} mute={false} />
    </div>
  {/each}
  <!-- Time label on bottom axis -->
  {#if xLabel}
    <div
      use:axisLabelCover={{ chart, at: xLabel }}
      style="position:absolute;bottom:{xLabel.bottom}px;left:{xLabel.left}px;transform:{xLabel.transform};{labelStyle}"
    >
      {xLabel.text}
    </div>
  {/if}
{/if}
