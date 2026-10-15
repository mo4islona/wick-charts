<script lang="ts">
import type { BandPointInput, ChartInstance, OHLCInput, TimePoint } from '@wick-charts/core';
import {
  BandSeries,
  BarSeries,
  CandlestickSeries,
  ChartContainer,
  InfoBar,
  LineSeries,
  Tooltip,
  catppuccin,
} from '@wick-charts/svelte';

import ChartProbe from './ChartProbe.svelte';

/**
 * Variants exercise the tooltip / info-bar parity fixes:
 *   - `ordered-legend` : InfoBar mounted *before* the series in the
 *     slot, to prove seriesChange catch-up works.
 *   - `layered-legend` : InfoBar over a multi-layer BarSeries to prove
 *     getLayerSnapshots expansion fires.
 *   - `ordered-tooltip`: Tooltip before series, sanity check it doesn't crash
 *     on initial empty series list.
 *   - `precision-legend`: InfoBar over sub-cent OHLC — regression guard
 *     for the old hardcoded `.toFixed(2)`.
 *   - `custom-format-legend`: InfoBar with a custom `format` prop.
 *   - `band-legend` / `band-tooltip`: the band row (`low – high`) in each overlay.
 */
export let variant:
  | 'ordered-legend'
  | 'layered-legend'
  | 'ordered-tooltip'
  | 'precision-legend'
  | 'custom-format-legend'
  | 'band-legend'
  | 'band-tooltip' = 'ordered-legend';
export let candlestickData: OHLCInput[] = [];
export let barData: TimePoint[][] = [[]];
export let lineData: TimePoint[][] = [[]];
export let bandData: BandPointInput[] = [];
export let onChart: (chart: ChartInstance) => void = () => {};

const tagged = (v: number, field: string) => `<${field}:${v}>`;
</script>

<ChartContainer theme={catppuccin.theme}>
  <ChartProbe {onChart} />
  {#if variant === 'ordered-legend'}
    <InfoBar />
    <CandlestickSeries data={candlestickData} />
  {:else if variant === 'layered-legend'}
    <InfoBar />
    <BarSeries data={barData} />
  {:else if variant === 'ordered-tooltip'}
    <Tooltip />
    <CandlestickSeries data={candlestickData} />
  {:else if variant === 'precision-legend'}
    <InfoBar />
    <CandlestickSeries data={candlestickData} />
  {:else if variant === 'custom-format-legend'}
    <InfoBar format={(v, field) => `<${field}:${v}>`} />
    <LineSeries data={lineData} />
  {:else if variant === 'band-legend'}
    <InfoBar format={tagged} />
    <BandSeries data={bandData} />
  {:else if variant === 'band-tooltip'}
    <Tooltip format={tagged} />
    <BandSeries data={bandData} />
  {/if}
</ChartContainer>
