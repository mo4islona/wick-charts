<script lang="ts">
import type { OHLCInput, PointClickInfo } from '@wick-charts/core';
import { CandlestickSeries, ChartContainer, catppuccin } from '@wick-charts/svelte';

export let candlestickData: OHLCInput[] = [];
export let onPointClick: ((info: PointClickInfo) => void) | undefined = undefined;
</script>

<ChartContainer theme={catppuccin.theme} {onPointClick}>
  <CandlestickSeries data={candlestickData} />
</ChartContainer>
