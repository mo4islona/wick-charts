<script lang="ts">
import type { ChartInstance } from '@wick-charts/core';
import { getChartContext } from '@wick-charts/svelte';

// Test-only probe: reads the chart from context (set by the enclosing
// <ChartContainer>) and hands it to the test exactly once, so a spec can call
// chart.setCrosshair / chart.setTheme directly.
export let onChart: (chart: ChartInstance) => void;

const chartStore = getChartContext();
let notified = false;

$: if ($chartStore && !notified) {
  notified = true;
  onChart($chartStore);
}
</script>
