<script lang="ts">
import type { CrosshairPosition, LineData, OHLCData, TooltipFormatter } from '@wick-charts/core';
import { formatCompact, formatPriceAdaptive, formatTime } from '@wick-charts/core';
import { onDestroy } from 'svelte';

import { getChartContext, getInfoBarAnchor, getThemeContext } from '../context';
import { createCrosshairPosition } from '../stores';
import { portal } from './portal';

/** Show only this series. When omitted, show all series. */
export let seriesId: string | undefined = undefined;
/** Sort order for line values when showing all series (default: 'none'). */
export let sort: 'none' | 'asc' | 'desc' = 'none';
/** Custom formatter for every displayed number (OHLC / volume / line value). */
export let format: TooltipFormatter = (v, field) => (field === 'volume' ? formatCompact(v) : formatPriceAdaptive(v));

interface SeriesSnapshot {
  id: string;
  label?: string;
  data: OHLCData | LineData;
  color: string;
}

const chartStore = getChartContext();
const themeStore = getThemeContext();
const anchorStore = getInfoBarAnchor();

let crosshair: CrosshairPosition | null = null;
let lastY: { value: number; isLive: boolean } | null = null;
let crosshairUnsub: (() => void) | null = null;
let lastYUnsub: (() => void) | null = null;
let seriesChangeUnsub: (() => void) | null = null;
let prevPrimaryId = '';
// `bump` forces targetIds / snapshots to recompute after sibling series
// register. Without this, a TooltipLegend mounted before its series would
// see `getSeriesIds() === []` and stay empty.
let bump = 0;

$: {
  const c = $chartStore;
  if (c) {
    if (!crosshairUnsub) {
      const posStore = createCrosshairPosition(c);
      crosshairUnsub = posStore.subscribe((v) => {
        crosshair = v;
      });
    }
    if (!seriesChangeUnsub) {
      const handler = () => {
        bump++;
      };
      c.on('seriesChange', handler);
      seriesChangeUnsub = () => c.off('seriesChange', handler);
      if (c.getSeriesIds().length > 0) bump++;
    }
    // Reference bump so the reactive block re-runs when series change.
    void bump;
    const allIds = c.getSeriesIds();
    const targetIds = seriesId ? [seriesId] : allIds;
    const primaryId = targetIds[0] ?? '';
    if (primaryId !== prevPrimaryId) {
      lastYUnsub?.();
      if (primaryId) {
        const handler = () => {
          lastY = c.getLastValue(primaryId);
        };
        c.on('dataUpdate', handler);
        lastYUnsub = () => c.off('dataUpdate', handler);
        handler();
      }
      prevPrimaryId = primaryId;
    }
  }
}

onDestroy(() => {
  crosshairUnsub?.();
  lastYUnsub?.();
  seriesChangeUnsub?.();
});

function sortSnapshots(s: SeriesSnapshot[], order: 'none' | 'asc' | 'desc'): SeriesSnapshot[] {
  if (order === 'none' || s.length <= 1) return s;
  return [...s].sort((a, b) => {
    const av = 'value' in a.data ? (a.data as LineData).value : (a.data as OHLCData).close;
    const bv = 'value' in b.data ? (b.data as LineData).value : (b.data as OHLCData).close;
    return order === 'asc' ? av - bv : bv - av;
  });
}

$: chart = $chartStore;
$: theme = $themeStore;
$: anchor = $anchorStore;
$: dataInterval = chart?.getDataInterval() ?? 86400;

// `bump` referenced explicitly so Svelte compiler keeps it as a dep — the
// outer `void bump;` pattern gets optimized away in some build configs.
$: targetIds = chart && bump >= 0 ? (seriesId ? [seriesId] : chart.getSeriesIds()) : [];

$: snapshots = (() => {
  if (!chart) return [] as SeriesSnapshot[];
  // Reference lastY + bump to pull them into reactive deps.
  const _touch = [lastY, bump];
  void _touch;
  const hover: SeriesSnapshot[] = [];
  if (crosshair) {
    const time = crosshair.time;
    for (const id of targetIds) {
      const layers = chart.getLayerSnapshots(id, time);
      if (layers) {
        for (let i = 0; i < layers.length; i++) {
          hover.push({
            id: `${id}_layer${i}`,
            label: chart.getSeriesLabel(id),
            data: { time, value: layers[i].value } as LineData,
            color: layers[i].color,
          });
        }
        continue;
      }
      const d = chart.getDataAtTime(id, time);
      if (d) hover.push({ id, label: chart.getSeriesLabel(id), data: d, color: chart.getSeriesColor(id) ?? '#888' });
    }
  }
  if (hover.length > 0) return sortSnapshots(hover, sort);
  const last: SeriesSnapshot[] = [];
  for (const id of targetIds) {
    const d = chart.getLastData(id);
    if (!d) continue;
    const layers = chart.getLayerSnapshots(id, d.time);
    if (layers) {
      for (let i = 0; i < layers.length; i++) {
        last.push({
          id: `${id}_layer${i}`,
          label: chart.getSeriesLabel(id),
          data: { time: d.time, value: layers[i].value } as LineData,
          color: layers[i].color,
        });
      }
      continue;
    }
    last.push({ id, label: chart.getSeriesLabel(id), data: d, color: chart.getSeriesColor(id) ?? '#888' });
  }
  return sortSnapshots(last, sort);
})();

$: displayTime = snapshots.length > 0 ? snapshots[0].data.time : 0;
</script>

{#if anchor && theme && snapshots.length > 0}
  <div
    use:portal={anchor}
    data-tooltip-legend=""
    style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;padding:4px 8px;flex-shrink:0;font-size:{theme.typography.fontSize}px;font-family:{theme.typography.fontFamily};font-variant-numeric:tabular-nums;opacity:{crosshair ? 1 : 0.6};transition:opacity 0.2s ease;pointer-events:none;"
  >
    <span style="color:{theme.axis.textColor};margin-right:2px;">{formatTime(displayTime, dataInterval)}</span>
    {#each snapshots as s (s.id)}
      {#if 'open' in s.data}
        {@const ohlc = /** @type {OHLCData} */ (s.data)}
        {@const isUp = ohlc.close >= ohlc.open}
        {@const c = isUp ? theme.candlestick.upColor : theme.candlestick.downColor}
        <span style="display:inline-flex;align-items:center;gap:4px;">
          <span style="color:{theme.axis.textColor};opacity:0.5;margin-left:5px;">O</span>
          <span style="color:{c};font-weight:500;margin-left:2px;">{format(ohlc.open, 'open')}</span>
          <span style="color:{theme.axis.textColor};opacity:0.5;margin-left:5px;">H</span>
          <span style="color:{c};font-weight:500;margin-left:2px;">{format(ohlc.high, 'high')}</span>
          <span style="color:{theme.axis.textColor};opacity:0.5;margin-left:5px;">L</span>
          <span style="color:{c};font-weight:500;margin-left:2px;">{format(ohlc.low, 'low')}</span>
          <span style="color:{theme.axis.textColor};opacity:0.5;margin-left:5px;">C</span>
          <span style="color:{c};font-weight:500;margin-left:2px;">{format(ohlc.close, 'close')}</span>
          {#if ohlc.volume != null}
            <span style="color:{theme.axis.textColor};opacity:0.5;margin-left:5px;">V</span>
            <span style="color:{theme.axis.textColor};font-weight:500;margin-left:2px;">{format(ohlc.volume, 'volume')}</span>
          {/if}
        </span>
      {:else}
        {@const line = /** @type {LineData} */ (s.data)}
        <span style="display:inline-flex;align-items:center;gap:3px;">
          <span style="width:6px;height:6px;border-radius:50%;background:{s.color};flex-shrink:0;" />
          <span style="color:{s.color};font-weight:500;">{format(line.value, 'value')}</span>
        </span>
      {/if}
    {/each}
  </div>
{/if}
