<script lang="ts">
import type { ChartInstance, CrosshairPosition, LineData, OHLCData } from '@wick-charts/core';
import { formatDate, formatTime } from '@wick-charts/core';
import { onDestroy } from 'svelte';

import { getChartContext } from '../context';
import { createCrosshairPosition } from '../stores';

/** Show only this series. When omitted, show all series. */
export let seriesId: string | undefined = undefined;
/** Sort order for line values when showing all series (default: 'none'). */
export let sort: 'none' | 'asc' | 'desc' = 'none';

interface SeriesSnapshot {
  id: string;
  label?: string;
  data: OHLCData | LineData;
  color: string;
}

const chartStore = getChartContext();
let crosshair: CrosshairPosition | null = null;
let lastY: { value: number; isLive: boolean } | null = null;
let crosshairUnsub: (() => void) | null = null;
let lastYUnsub: (() => void) | null = null;

let prevPrimaryId = '';

$: {
  const chart = $chartStore;
  if (chart) {
    if (!crosshairUnsub) {
      const posStore = createCrosshairPosition(chart);
      crosshairUnsub = posStore.subscribe((v) => {
        crosshair = v;
      });
    }

    const allIds = chart.getSeriesIds();
    const targetIds = seriesId ? [seriesId] : allIds;
    const primaryId = targetIds[0] ?? '';

    if (primaryId !== prevPrimaryId) {
      lastYUnsub?.();
      if (primaryId) {
        const handler = () => {
          lastY = chart.getLastValue(primaryId);
        };
        chart.on('dataUpdate', handler);
        lastYUnsub = () => chart.off('dataUpdate', handler);
        handler();
      }
      prevPrimaryId = primaryId;
    }
  }
}

onDestroy(() => {
  crosshairUnsub?.();
  lastYUnsub?.();
});

function sortSnapshots(snapshots: SeriesSnapshot[], sortOrder: 'none' | 'asc' | 'desc'): SeriesSnapshot[] {
  if (sortOrder === 'none' || snapshots.length <= 1) return snapshots;
  return [...snapshots].sort((a, b) => {
    const av = 'value' in a.data ? (a.data as LineData).value : (a.data as OHLCData).close;
    const bv = 'value' in b.data ? (b.data as LineData).value : (b.data as OHLCData).close;
    return sortOrder === 'asc' ? av - bv : bv - av;
  });
}

function formatVolume(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(0);
}

$: chart = $chartStore;
$: theme = chart?.getTheme();
$: dataInterval = chart?.getDataInterval() ?? 86400;

$: targetIds = (() => {
  if (!chart) return [];
  const allIds = chart.getSeriesIds();
  return seriesId ? [seriesId] : allIds;
})();

$: hoverSnapshots = (() => {
  if (!chart || !crosshair) return [];
  const result: SeriesSnapshot[] = [];
  for (const id of targetIds) {
    const d = chart.getDataAtTime(id, crosshair.time);
    if (d) result.push({ id, label: chart.getSeriesLabel(id), data: d, color: chart.getSeriesColor(id) ?? '#888' });
  }
  return result;
})();

$: lastSnapshots = (() => {
  if (!chart) return [];
  // Reference lastY to trigger reactivity on data updates
  void lastY;
  const result: SeriesSnapshot[] = [];
  for (const id of targetIds) {
    const d = chart.getLastData(id);
    if (d) result.push({ id, label: chart.getSeriesLabel(id), data: d, color: chart.getSeriesColor(id) ?? '#888' });
  }
  return result;
})();

$: rawSnapshots = hoverSnapshots.length > 0 ? hoverSnapshots : lastSnapshots;
$: snapshots = sortSnapshots(rawSnapshots, sort);
$: displayTime = snapshots.length > 0 ? snapshots[0].data.time : 0;

$: mediaSize = chart?.getMediaSize();

$: floatingPos = (() => {
  if (!crosshair || !chart || !mediaSize) return { left: 0, top: 0 };
  const hasOHLC = snapshots.some((s) => 'open' in s.data);
  const lineCount = snapshots.filter((s) => !('open' in s.data)).length;
  const tooltipWidth = 160;
  const tooltipHeight = hasOHLC ? 140 : 40 + lineCount * 22;
  const offsetX = 16;
  const offsetY = 16;
  const chartWidth = mediaSize.width - chart.yAxisWidth;
  const chartHeight = mediaSize.height - chart.xAxisHeight;

  const left =
    crosshair.mediaX + offsetX + tooltipWidth > chartWidth
      ? crosshair.mediaX - offsetX - tooltipWidth
      : crosshair.mediaX + offsetX;
  const top =
    crosshair.mediaY + offsetY + tooltipHeight > chartHeight
      ? crosshair.mediaY - offsetY - tooltipHeight
      : crosshair.mediaY + offsetY;

  return { left, top };
})();

$: showFloating = crosshair && hoverSnapshots.length > 0;
</script>

{#if snapshots.length > 0 && chart && theme}
  <!-- Compact legend (below chart title) -->
  <div
    style="position:absolute;top:24px;left:8px;pointer-events:none;display:flex;align-items:center;gap:4px;flex-wrap:wrap;max-width:70%;font-size:{theme.typography.fontSize}px;font-family:{theme.typography.fontFamily};font-variant-numeric:tabular-nums;opacity:{crosshair ? 1 : 0.6};transition:opacity 0.2s ease;"
  >
    <span style="color:{theme.axis.textColor};margin-right:2px;">{formatTime(displayTime, dataInterval)}</span>
    {#each snapshots as s (s.id)}
      {#if 'open' in s.data}
        {@const ohlc = /** @type {OHLCData} */ (s.data)}
        {@const isUp = ohlc.close >= ohlc.open}
        {@const c = isUp ? theme.candlestick.upColor : theme.candlestick.downColor}
        <span style="display:inline-flex;align-items:center;gap:4px;">
          <span style="color:{theme.axis.textColor};opacity:0.5;margin-left:5px;">O</span>
          <span style="color:{c};font-weight:500;margin-left:2px;">{ohlc.open.toFixed(2)}</span>
          <span style="color:{theme.axis.textColor};opacity:0.5;margin-left:5px;">H</span>
          <span style="color:{c};font-weight:500;margin-left:2px;">{ohlc.high.toFixed(2)}</span>
          <span style="color:{theme.axis.textColor};opacity:0.5;margin-left:5px;">L</span>
          <span style="color:{c};font-weight:500;margin-left:2px;">{ohlc.low.toFixed(2)}</span>
          <span style="color:{theme.axis.textColor};opacity:0.5;margin-left:5px;">C</span>
          <span style="color:{c};font-weight:500;margin-left:2px;">{ohlc.close.toFixed(2)}</span>
          {#if ohlc.volume != null}
            <span style="color:{theme.axis.textColor};opacity:0.5;margin-left:5px;">V</span>
            <span style="color:{theme.axis.textColor};font-weight:500;margin-left:2px;">{formatVolume(ohlc.volume)}</span>
          {/if}
        </span>
      {:else}
        {@const line = /** @type {LineData} */ (s.data)}
        <span style="display:inline-flex;align-items:center;gap:3px;">
          <span
            style="width:6px;height:6px;border-radius:50%;background:{s.color};flex-shrink:0;"
          />
          <span style="color:{s.color};font-weight:500;">{line.value.toFixed(2)}</span>
        </span>
      {/if}
    {/each}
  </div>

  <!-- Floating tooltip (near cursor, only on hover) -->
  {#if showFloating}
    <div
      style="position:absolute;left:{floatingPos.left}px;top:{floatingPos.top}px;pointer-events:none;background:{theme.tooltip.background};backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid {theme.tooltip.borderColor};border-radius:8px;padding:10px 14px;box-shadow:0 4px 16px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06);font-size:{theme.typography.tooltipFontSize}px;font-family:{theme.typography.fontFamily};font-variant-numeric:tabular-nums;color:{theme.tooltip.textColor};min-width:140px;z-index:10;transition:opacity 0.15s ease;"
    >
      <!-- Time header -->
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
            <span style="font-weight:600;color:{valColor};text-align:right;">{ohlc.open.toFixed(2)}</span>
            <span style="opacity:0.5;">High</span>
            <span style="font-weight:600;color:{valColor};text-align:right;">{ohlc.high.toFixed(2)}</span>
            <span style="opacity:0.5;">Low</span>
            <span style="font-weight:600;color:{valColor};text-align:right;">{ohlc.low.toFixed(2)}</span>
            <span style="opacity:0.5;">Close</span>
            <span style="font-weight:600;color:{valColor};text-align:right;">{ohlc.close.toFixed(2)}</span>
            {#if ohlc.volume != null}
              <span style="opacity:0.5;">Volume</span>
              <span style="font-weight:600;color:{theme.tooltip.textColor};text-align:right;">{formatVolume(ohlc.volume)}</span>
            {/if}
          </div>
        {:else}
          {@const line = /** @type {LineData} */ (s.data)}
          <div style="display:flex;align-items:center;gap:8px;padding:2px 0;">
            <span
              style="width:8px;height:8px;border-radius:50%;background:{s.color};flex-shrink:0;"
            />
            <span style="opacity:0.6;flex:1;">{s.label ?? 'Value'}</span>
            <span style="font-weight:600;color:{s.color};">{line.value.toFixed(2)}</span>
          </div>
        {/if}
      {/each}
    </div>
  {/if}
{/if}
