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
  buildLastSnapshots,
  formatCompact,
  formatPriceAdaptive,
  formatTime,
} from '@wick-charts/core';
import { onDestroy } from 'svelte';

import { getChartContext, getInfoBarAnchor, getThemeContext } from '../context';
import { createCrosshairPosition } from '../stores';
import { portal } from './portal';

/** Sort order for line values (default: 'none'). */
export let sort: SnapshotSort = 'none';
/** Custom formatter for every displayed number (OHLC / volume / line value). Ignored when a slot is provided. */
export let format: TooltipFormatter = (v, field) => (field === 'volume' ? formatCompact(v) : formatPriceAdaptive(v));

const chartStore = getChartContext();
const themeStore = getThemeContext();
const anchorStore = getInfoBarAnchor();

let crosshair: CrosshairPosition | null = null;
let crosshairUnsub: (() => void) | null = null;
let overlayUnsub: (() => void) | null = null;
// `bump` re-runs snapshot computations on any overlay-relevant chart mutation.
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
    if (!overlayUnsub) {
      const handler = () => {
        bump++;
      };
      c.on('overlayChange', handler);
      overlayUnsub = () => c.off('overlayChange', handler);
      if (c.getSeriesIds().length > 0) bump++;
    }
  }
}

onDestroy(() => {
  crosshairUnsub?.();
  overlayUnsub?.();
});

$: chart = $chartStore;
$: theme = $themeStore;
$: anchor = $anchorStore;
$: dataInterval = chart?.getDataInterval() ?? 86400;

// Hover-over-the-y-axis gap: the overlay canvas includes the y-axis strip,
// so a crosshair event fires for offsets past the plotted data. The
// nearest-time lookup then snaps to an out-of-range timestamp and returns
// no samples. Falling back to last-mode snapshots keeps the bar populated
// (0.6 opacity) instead of blinking out every time the pointer grazes the
// y-axis.
// `bump >= 0` keeps the Svelte compiler from eliminating `bump` from the
// reactive dep graph.
$: hoverSnapshots =
  chart && bump >= 0 && crosshair
    ? buildHoverSnapshots(chart, { time: crosshair.time, sort, cacheKey: 'infobar-hover' })
    : null;
$: lastSnapshots =
  chart && bump >= 0
    ? buildLastSnapshots(chart, { sort, cacheKey: 'infobar-last' })
    : ([] as readonly SeriesSnapshot[]);
$: isHover = hoverSnapshots !== null && hoverSnapshots.length > 0;
$: snapshots = isHover ? (hoverSnapshots as readonly SeriesSnapshot[]) : lastSnapshots;

$: displayTime =
  snapshots.length === 0 ? 0 : isHover && crosshair ? crosshair.time : Math.max(...snapshots.map((s) => s.data.time));
</script>

{#if anchor && theme && snapshots.length > 0}
  {#if $$slots.default}
    <div
      use:portal={anchor}
      data-tooltip-legend=""
      style="display:flex;align-items:center;flex-shrink:0;font-size:{theme.typography.fontSize}px;font-family:{theme.typography.fontFamily};font-variant-numeric:tabular-nums;opacity:{isHover ? 1 : 0.6};transition:opacity 0.2s ease;pointer-events:none;"
    >
      <slot {snapshots} time={displayTime} {isHover} />
    </div>
  {:else}
    <div
      use:portal={anchor}
      data-tooltip-legend=""
      style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;padding:4px 8px;flex-shrink:0;font-size:{theme.typography.fontSize}px;font-family:{theme.typography.fontFamily};font-variant-numeric:tabular-nums;opacity:{isHover ? 1 : 0.6};transition:opacity 0.2s ease;pointer-events:none;"
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
{/if}
