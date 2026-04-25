<script lang="ts">
import type { NavigatorData, OHLCInput } from '@wick-charts/core';
import { CandlestickSeries, ChartContainer, Navigator, darkTheme } from '@wick-charts/svelte';

export let candlestickData: OHLCInput[] = [];
export let navigatorData: NavigatorData = { type: 'line', points: [] };
export let height: number | undefined = undefined;
</script>

<ChartContainer theme={darkTheme}>
  <CandlestickSeries data={candlestickData} />
  <Navigator data={navigatorData} {height} />
</ChartContainer>
