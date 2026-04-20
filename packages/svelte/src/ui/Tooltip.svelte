<script lang="ts">
import type {
  CrosshairPosition,
  LineData,
  OHLCData,
  SeriesSnapshot,
  SnapshotSort,
  TooltipFormatter,
} from '@wick-charts/core';
import {
  buildHoverSnapshots,
  computeTooltipPosition,
  formatCompact,
  formatDate,
  formatPriceAdaptive,
  formatTime,
} from '@wick-charts/core';
import { onDestroy } from 'svelte';

import { getChartContext } from '../context';
import { createCrosshairPosition } from '../stores';

/** Sort order for line values (default: 'none'). */
export let sort: SnapshotSort = 'none';
/**
 * Custom formatter for every displayed number. Ignored when a slot is
 * provided. Called with the field hint
 * (`'open' | 'high' | 'low' | 'close' | 'volume' | 'value'`).
 */
export let format: TooltipFormatter = (v, field) => (field === 'volume' ? formatCompact(v) : formatPriceAdaptive(v));

const chartStore = getChartContext();
let crosshair: CrosshairPosition | null = null;
let crosshairUnsub: (() => void) | null = null;
let overlayUnsub: (() => void) | null = null;
// `bump` re-runs snapshot computations on any overlay-relevant chart mutation.
let bump = 0;

$: {
  const chart = $chartStore;
  if (chart) {
    if (!crosshairUnsub) {
      const posStore = createCrosshairPosition(chart);
      crosshairUnsub = posStore.subscribe((v) => {
        crosshair = v;
      });
    }
    if (!overlayUnsub) {
      const handler = () => {
        bump++;
      };
      chart.on('overlayChange', handler);
      overlayUnsub = () => chart.off('overlayChange', handler);
      if (chart.getSeriesIds().length > 0) bump++;
    }
  }
}

onDestroy(() => {
  crosshairUnsub?.();
  overlayUnsub?.();
});

$: chart = $chartStore;
$: theme = chart?.getTheme();
$: dataInterval = chart?.getDataInterval() ?? 86400;

// `bump >= 0` referenced at the top level so the Svelte compiler keeps `bump`
// as a reactive dep — `void bump` inside an IIFE is dead-code-eliminated in
// some build configs.
$: snapshots =
  chart && crosshair && bump >= 0
    ? buildHoverSnapshots(chart, { time: crosshair.time, sort, cacheKey: 'tooltip' })
    : ([] as readonly SeriesSnapshot[]);

// `crosshair.time` is the semantic truth — `snapshots[0].data.time` would
// shift with `sort` and, for ragged multi-layer data, disagree with the
// actual hover moment.
$: displayTime = crosshair?.time ?? 0;
$: mediaSize = chart?.getMediaSize();

let measuredSize: { width: number; height: number } | null = null;

// A Svelte action so the observer's lifecycle is tied to the slot container:
// when the `{#if}` block unmounts the node (hover ends) the action's
// `destroy()` disconnects, and on the next mount a fresh observer attaches
// to the new node. Without this the observer stays attached to a detached
// node and `measuredSize` goes stale on the second hover.
function measureOnResize(node: HTMLDivElement) {
  if (typeof ResizeObserver === 'undefined') return { destroy() {} };

  const ro = new ResizeObserver((entries) => {
    const box = entries[0]?.contentRect;
    if (!box) return;
    if (!measuredSize || measuredSize.width !== box.width || measuredSize.height !== box.height) {
      measuredSize = { width: box.width, height: box.height };
    }
  });
  ro.observe(node);

  return {
    destroy() {
      ro.disconnect();
      // Reset so the next hover starts hidden-until-measured rather than
      // reusing the previous tooltip's size for one frame.
      measuredSize = null;
    },
  };
}

$: floatingPos = (() => {
  if (!crosshair || !chart || !mediaSize || snapshots.length === 0) return null;
  const chartWidth = mediaSize.width - chart.yAxisWidth;
  const chartHeight = mediaSize.height - chart.xAxisHeight;

  if ($$slots.default) {
    if (!measuredSize) return { left: 0, top: 0 };

    return computeTooltipPosition({
      x: crosshair.mediaX,
      y: crosshair.mediaY,
      chartWidth,
      chartHeight,
      tooltipWidth: measuredSize.width,
      tooltipHeight: measuredSize.height,
    });
  }

  const hasOHLC = snapshots.some((s) => 'open' in s.data);
  const lineCount = snapshots.filter((s) => !('open' in s.data)).length;
  const tooltipWidth = 160;
  const tooltipHeight = hasOHLC ? 140 : 40 + lineCount * 22;

  return computeTooltipPosition({
    x: crosshair.mediaX,
    y: crosshair.mediaY,
    chartWidth,
    chartHeight,
    tooltipWidth,
    tooltipHeight,
  });
})();
</script>

{#if crosshair && snapshots.length > 0 && chart && theme && floatingPos}
  {#if $$slots.default}
    <div
      use:measureOnResize
      data-measured={measuredSize ? 'true' : 'false'}
      style="position:absolute;left:{floatingPos.left}px;top:{floatingPos.top}px;pointer-events:none;background:{theme.tooltip.background};backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid {theme.tooltip.borderColor};border-radius:8px;padding:10px 14px;box-shadow:0 4px 16px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06);font-family:{theme.typography.fontFamily};font-size:{theme.typography.tooltipFontSize}px;font-variant-numeric:tabular-nums;color:{theme.tooltip.textColor};width:max-content;max-width:{mediaSize ? mediaSize.width - chart.yAxisWidth : 0}px;box-sizing:border-box;z-index:10;visibility:{measuredSize ? 'visible' : 'hidden'};"
    >
      <slot {snapshots} time={displayTime} />
    </div>
  {:else}
    <div
      style="position:absolute;left:{floatingPos.left}px;top:{floatingPos.top}px;pointer-events:none;background:{theme.tooltip.background};backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid {theme.tooltip.borderColor};border-radius:8px;padding:10px 14px;box-shadow:0 4px 16px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06);font-size:{theme.typography.tooltipFontSize}px;font-family:{theme.typography.fontFamily};font-variant-numeric:tabular-nums;color:{theme.tooltip.textColor};min-width:140px;z-index:10;transition:opacity 0.15s ease;"
    >
      <div
        style="font-size:{theme.typography.axisFontSize}px;color:{theme.axis.textColor};margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid {theme.tooltip.borderColor};letter-spacing:0.02em;"
      >
        {formatDate(displayTime)} {formatTime(displayTime, dataInterval)}
      </div>

      {#each snapshots as s (s.id)}
        {#if 'open' in s.data}
          {@const ohlc = /** @type {OHLCData} */ (s.data)}
          {@const isUp = ohlc.close >= ohlc.open}
          {@const valColor = isUp ? theme.candlestick.upColor : theme.candlestick.downColor}
          <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;">
            <span style="opacity:0.5;">Open</span>
            <span style="font-weight:600;color:{valColor};text-align:right;">{format(ohlc.open, 'open')}</span>
            <span style="opacity:0.5;">High</span>
            <span style="font-weight:600;color:{valColor};text-align:right;">{format(ohlc.high, 'high')}</span>
            <span style="opacity:0.5;">Low</span>
            <span style="font-weight:600;color:{valColor};text-align:right;">{format(ohlc.low, 'low')}</span>
            <span style="opacity:0.5;">Close</span>
            <span style="font-weight:600;color:{valColor};text-align:right;">{format(ohlc.close, 'close')}</span>
            {#if ohlc.volume != null}
              <span style="opacity:0.5;">Volume</span>
              <span style="font-weight:600;color:{theme.tooltip.textColor};text-align:right;">{format(ohlc.volume, 'volume')}</span>
            {/if}
          </div>
        {:else}
          {@const line = /** @type {LineData} */ (s.data)}
          <div style="display:flex;align-items:center;gap:8px;padding:2px 0;">
            <span style="width:8px;height:8px;border-radius:50%;background:{s.color};flex-shrink:0;" />
            <span style="opacity:0.6;flex:1;">{s.label ?? 'Value'}</span>
            <span style="font-weight:600;color:{s.color};">{format(line.value, 'value')}</span>
          </div>
        {/if}
      {/each}
    </div>
  {/if}
{/if}
