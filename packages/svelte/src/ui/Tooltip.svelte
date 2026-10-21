<script lang="ts">
import type {
  BandPoint,
  CrosshairPosition,
  OHLCData,
  SeriesSnapshot,
  SnapshotSort,
  TooltipFormatter,
} from '@wick-charts/core';
import {
  buildHoverSnapshots,
  computeTooltipPosition,
  formatRowTime,
  formatRowValue,
  formatTooltipHeader,
  resolveCandlestickBodyColor,
  rowFormatter,
} from '@wick-charts/core';
import { afterUpdate, onDestroy } from 'svelte';

import { getChartContext } from '../context.js';
import { createCrosshairPosition } from '../stores.js';
import NumberText from './NumberText.svelte';

/** Sort order for line values (default: 'none'). */
export let sort: SnapshotSort = 'none';
/**
 * Custom formatter for every displayed number. Ignored when a slot is
 * provided. Called with the field hint
 * (`'open' | 'high' | 'low' | 'close' | 'volume' | 'value'`).
 */
export let format: TooltipFormatter | undefined = undefined;

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
      // Rows read animated values (smoothing, fades, percent shares).
      chart.on('seriesFrame', handler);
      overlayUnsub = () => {
        chart.off('overlayChange', handler);
        chart.off('seriesFrame', handler);
      };
      if (chart.getSeriesIds().length > 0) bump++;
    }
  }
}

onDestroy(() => {
  crosshairUnsub?.();
  overlayUnsub?.();
});

$: chart = $chartStore;
$: theme = chart && bump >= 0 ? chart.getTheme() : undefined;
// Re-read on every overlay change: data that lands after mount sets the interval.
$: dataInterval = chart && bump >= 0 ? chart.getDataInterval() : 86400;

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

interface BoxSize {
  width: number;
  height: number;
}

/** Border-box size of the node, `null` before it has a layout. */
function readBox(node: HTMLElement | null): BoxSize | null {
  if (node === null) return null;

  const width = node.offsetWidth;
  if (width === 0) return null;

  return { width, height: node.offsetHeight };
}

function sameBox(a: BoxSize | null, b: BoxSize | null): boolean {
  if (a === null || b === null) return a === b;

  return a.width === b.width && a.height === b.height;
}

// Both boxes size to their content. Rows and labels change with the hover,
// so measure after every update; a new size updates again in the same flush, before paint.
let box: HTMLDivElement | null = null;
let boxSize: BoxSize | null = null;

function measureBox(): void {
  const next = readBox(box);
  // Svelte invalidates on every object assignment, so assign only a real change.
  if (!sameBox(boxSize, next)) boxSize = next;
}

afterUpdate(measureBox);

// Custom slot content can also resize between updates (an image that loads).
// `contentRect` leaves out the padding and border, so the callback reads the border box.
function observeResize(node: HTMLDivElement) {
  if (typeof ResizeObserver === 'undefined') return { destroy() {} };

  const ro = new ResizeObserver(measureBox);
  ro.observe(node);

  return {
    destroy() {
      ro.disconnect();
    },
  };
}

$: floatingPos = (() => {
  if (!crosshair || !chart || !mediaSize || snapshots.length === 0) return null;
  const chartLeft = chart.plotLeft;
  const chartWidth = chart.getLayout().chartArea.width;
  const chartHeight = mediaSize.height - chart.xAxisHeight;

  if ($$slots.default) {
    // Custom slot content has no size to estimate, so the box stays hidden until it is measured.
    if (!boxSize) return { left: chartLeft, top: 0 };

    return computeTooltipPosition({
      x: crosshair.mediaX,
      y: crosshair.mediaY,
      chartLeft,
      chartWidth,
      chartHeight,
      tooltipWidth: boxSize.width,
      tooltipHeight: boxSize.height,
    });
  }

  const hasOHLC = snapshots.some((s) => 'open' in s.data);
  const lineCount = snapshots.filter((s) => !('open' in s.data)).length;
  // Until the box is measured, estimate it: a band row carries two numbers, a percent-stack row a share and a value.
  const hasBand = snapshots.some((s) => 'high' in s.data && !('open' in s.data));
  const hasShare = snapshots.some((s) => s.share !== undefined);
  let estimatedWidth = 160;
  if (hasBand) estimatedWidth = 220;
  if (hasShare) estimatedWidth = 240;
  const estimatedHeight = hasOHLC ? 140 : 40 + lineCount * 22;
  const tooltipWidth = boxSize?.width ?? estimatedWidth;
  const tooltipHeight = boxSize?.height ?? estimatedHeight;

  return computeTooltipPosition({
    x: crosshair.mediaX,
    y: crosshair.mediaY,
    chartLeft,
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
      bind:this={box}
      use:observeResize
      data-chart-tooltip=""
      data-measured={boxSize ? 'true' : 'false'}
      style="position:absolute;left:{floatingPos.left}px;top:{floatingPos.top}px;pointer-events:none;background:{theme.tooltip.background};backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid {theme.tooltip.borderColor};border-radius:8px;padding:10px 14px;box-shadow:0 4px 16px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06);font-family:{theme.typography.fontFamily};font-size:{theme.tooltip.fontSize}px;font-variant-numeric:tabular-nums;color:{theme.tooltip.textColor};width:max-content;max-width:{mediaSize ? chart.getLayout().chartArea.width : 0}px;box-sizing:border-box;z-index:10;visibility:{boxSize ? 'visible' : 'hidden'};"
    >
      <slot {snapshots} time={displayTime} />
    </div>
  {:else}
    <div
      bind:this={box}
      data-chart-tooltip=""
      style="position:absolute;left:{floatingPos.left}px;top:{floatingPos.top}px;pointer-events:none;background:{theme.tooltip.background};backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid {theme.tooltip.borderColor};border-radius:8px;padding:10px 14px;box-shadow:0 4px 16px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06);font-size:{theme.tooltip.fontSize}px;font-family:{theme.typography.fontFamily};font-variant-numeric:tabular-nums;color:{theme.tooltip.textColor};width:max-content;min-width:140px;max-width:{chart.getLayout().chartArea.width}px;box-sizing:border-box;z-index:10;transition:opacity 0.15s ease;"
    >
      <div
        style="font-size:{theme.axis.fontSize}px;color:{theme.axis.textColor};margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid {theme.tooltip.borderColor};letter-spacing:0.02em;"
      >
        {formatTooltipHeader(chart, { time: displayTime, snapshots, interval: dataInterval })}
      </div>

      {#each snapshots as s (s.id)}
        {@const rowFormat = rowFormatter(chart, s, format)}
        {@const rowTime = formatRowTime(chart, { time: displayTime, snapshots, interval: dataInterval, snapshot: s })}
        {#if 'open' in s.data}
          {@const ohlc = /** @type {OHLCData} */ (s.data)}
          {@const isUp = ohlc.close >= ohlc.open}
          {@const valColor = theme.tooltip.valueColor ?? resolveCandlestickBodyColor(isUp ? theme.candlestick.up.body : theme.candlestick.down.body)}
          <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;">
            {#if rowTime !== null}<span style="grid-column:1 / -1;opacity:0.45;white-space:nowrap;">{rowTime}</span>{/if}
            <span style="opacity:0.5;">Open</span>
            <span style="font-weight:600;color:{valColor};text-align:right;"><NumberText text={rowFormat(ohlc.open, 'open')} /></span>
            <span style="opacity:0.5;">High</span>
            <span style="font-weight:600;color:{valColor};text-align:right;"><NumberText text={rowFormat(ohlc.high, 'high')} /></span>
            <span style="opacity:0.5;">Low</span>
            <span style="font-weight:600;color:{valColor};text-align:right;"><NumberText text={rowFormat(ohlc.low, 'low')} /></span>
            <span style="opacity:0.5;">Close</span>
            <span style="font-weight:600;color:{valColor};text-align:right;"><NumberText text={rowFormat(ohlc.close, 'close')} /></span>
            {#if ohlc.volume != null}
              <span style="opacity:0.5;">Volume</span>
              <span style="font-weight:600;color:{theme.tooltip.textColor};text-align:right;"><NumberText text={rowFormat(ohlc.volume, 'volume')} /></span>
            {/if}
          </div>
        {:else if 'high' in s.data}
          {@const band = /** @type {BandPoint} */ (s.data)}
          <div style="display:flex;align-items:center;gap:8px;padding:2px 0;">
            <span style="width:8px;height:8px;border-radius:2px;background:{s.color};flex-shrink:0;"></span>
            <span style="opacity:0.6;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{s.label ?? 'Range'}</span>
            {#if rowTime !== null}<span style="opacity:0.45;white-space:nowrap;">{rowTime}</span>{/if}
            <span style="font-weight:600;color:{theme.tooltip.valueColor ?? s.color};white-space:nowrap;"><NumberText text={rowFormat(band.low, 'low')} /> – <NumberText text={rowFormat(band.high, 'high')} /></span>
          </div>
        {:else}
          <div style="display:flex;align-items:center;gap:8px;padding:2px 0;">
            <span style="width:8px;height:8px;border-radius:50%;background:{s.color};flex-shrink:0;"></span>
            <span style="opacity:0.6;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{s.label ?? 'Value'}</span>
            {#if rowTime !== null}<span style="opacity:0.45;white-space:nowrap;">{rowTime}</span>{/if}
            <span style="font-weight:600;color:{theme.tooltip.valueColor ?? s.color};white-space:nowrap;"><NumberText text={formatRowValue(s, (v) => rowFormat(v, 'value'))} /></span>
          </div>
        {/if}
      {/each}
    </div>
  {/if}
{/if}
