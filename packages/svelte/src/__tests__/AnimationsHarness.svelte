<script lang="ts">
import type { AnimationsConfig, OHLCInput } from '@wick-charts/core';
import { CandlestickSeries, ChartContainer, catppuccin } from '@wick-charts/svelte';

export let candlestickData: OHLCInput[] = [];
export let animations: boolean | AnimationsConfig | undefined = undefined;
</script>

<ChartContainer theme={catppuccin.theme} {animations}>
  <CandlestickSeries data={candlestickData} />
</ChartContainer>
