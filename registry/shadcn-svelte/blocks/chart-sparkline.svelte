<script lang="ts">
	import SparklineCard, { type SparklineMetric } from "./sparkline-card.svelte";

	const revenue: SparklineMetric = {
		label: "Revenue",
		base: 48_200,
		volatility: 0.01,
		format: (value) =>
			value.toLocaleString("en-US", {
				style: "currency",
				currency: "USD",
				maximumFractionDigits: 0,
			}),
	};
</script>

<div class="mx-auto w-full max-w-sm">
	<SparklineCard metric={revenue} />
</div>
