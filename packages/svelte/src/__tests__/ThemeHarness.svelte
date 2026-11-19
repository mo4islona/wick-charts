<script lang="ts">
import type { ChartInstance, ThemeInput } from '@wick-charts/core';
import { ChartContainer } from '@wick-charts/svelte';

import ChartProbe from './ChartProbe.svelte';

export let theme: ThemeInput | undefined = undefined;
export let onChart: (chart: ChartInstance) => void = () => {};
</script>

<ChartContainer {theme}>
  <ChartProbe {onChart} />
</ChartContainer>
