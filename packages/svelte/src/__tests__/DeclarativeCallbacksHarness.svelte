<script lang="ts">
import type { ChartInstance, CrosshairPosition, OHLCInput, VisibleRange, VisibleRangeSpec } from '@wick-charts/core';
import { CandlestickSeries, ChartContainer, catppuccin } from '@wick-charts/svelte';

export let candlestickData: OHLCInput[] = [];
export let onReady: ((chart: ChartInstance) => void) | undefined = undefined;
export let onVisibleRangeChange: ((range: VisibleRange) => void) | undefined = undefined;
export let onCrosshairMove: ((position: CrosshairPosition | null) => void) | undefined = undefined;
export let visibleRange: VisibleRangeSpec | undefined = undefined;
</script>

<ChartContainer theme={catppuccin.theme} {onReady} {onVisibleRangeChange} {onCrosshairMove} {visibleRange}>
  <CandlestickSeries data={candlestickData} />
</ChartContainer>
