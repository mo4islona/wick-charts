<script lang="ts">
	import { GaugeSeries } from "@wick-charts/svelte";
	import { onMount } from "svelte";

	import * as Card from "$lib/registry/ui/card/index.js";
	import { WickChart } from "$lib/registry/ui/wick-chart/index.js";

	const TICK_MS = 1000;

	const formatPercent = (value: number) => `${Math.round(value)}%`;

	const gaugeOptions = {
		label: "CPU load",
		format: formatPercent,
		zones: [{ to: 60 }, { to: 85 }, { to: 100 }],
	};

	// Demo feed: replace with your own metric.
	function nextLoad(previous: number): number {
		const drift = (58 - previous) * 0.1;
		const load = previous + drift + (Math.random() - 0.5) * 14;

		return Math.min(100, Math.max(0, load));
	}

	let load = $state(58);

	onMount(() => {
		const timer = setInterval(() => {
			load = nextLoad(load);
		}, TICK_MS);

		return () => clearInterval(timer);
	});
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Server load</Card.Title>
		<Card.Description>api-1, updated every second</Card.Description>
	</Card.Header>
	<Card.Content>
		<WickChart class="aspect-auto h-[240px]">
			<GaugeSeries value={load} options={gaugeOptions} />
		</WickChart>
	</Card.Content>
</Card.Root>
