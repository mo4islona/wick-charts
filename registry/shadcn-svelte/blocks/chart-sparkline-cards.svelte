<script lang="ts">
	import SparklineCard, { type SparklineMetric } from "./sparkline-card.svelte";

	const metrics: SparklineMetric[] = [
		{
			label: "Revenue",
			base: 48_200,
			volatility: 0.01,
			format: (value) =>
				value.toLocaleString("en-US", {
					style: "currency",
					currency: "USD",
					maximumFractionDigits: 0,
				}),
		},
		{
			label: "Active users",
			base: 2_350,
			volatility: 0.02,
			format: (value) => Math.round(value).toLocaleString("en-US"),
		},
		{
			label: "p95 latency",
			base: 182,
			volatility: 0.04,
			format: (value) => `${Math.round(value)} ms`,
			lowerIsBetter: true,
		},
	];
</script>

<div class="grid gap-4 sm:grid-cols-3">
	{#each metrics as metric (metric.label)}
		<SparklineCard {metric} />
	{/each}
</div>
