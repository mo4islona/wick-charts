<script lang="ts">
import type { ChartInstance, ChartTheme } from '@wick-charts/core';
import { ChartContainer } from '@wick-charts/svelte';

import ChartProbe from './ChartProbe.svelte';

export let theme: ChartTheme | undefined = undefined;
export let onChart: (chart: ChartInstance) => void = () => {};
</script>

<ChartContainer {theme}>
  <ChartProbe {onChart} />
</ChartContainer>
