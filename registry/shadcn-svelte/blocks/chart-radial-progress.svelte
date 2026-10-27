<script lang="ts">
	import { type PieSliceData, RadialProgressSeries, startLabels } from "@wick-charts/svelte";
	import { onMount } from "svelte";

	import * as Card from "$lib/registry/ui/card/index.js";
	import { WickChart } from "$lib/registry/ui/wick-chart/index.js";

	const TICK_MS = 2000;

	const initialUsage: PieSliceData[] = [
		{ label: "Seats", value: 83 },
		{ label: "API calls", value: 64 },
		{ label: "Storage", value: 41 },
	];

	const radialOptions = { endAngle: 270, labels: startLabels() };

	// Demo feed: usage grows a little every tick and starts over at the limit.
	function addUsage(items: PieSliceData[]): PieSliceData[] {
		return items.map((item) => {
			const value = item.value + Math.random() * 1.5;

			return { ...item, value: value > 100 ? 20 : value };
		});
	}

	let usage = $state.raw(initialUsage);

	onMount(() => {
		const timer = setInterval(() => {
			usage = addUsage(usage);
		}, TICK_MS);

		return () => clearInterval(timer);
	});
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Plan usage</Card.Title>
		<Card.Description>Share of the Pro plan limits, this month</Card.Description>
	</Card.Header>
	<Card.Content>
		<WickChart class="aspect-auto h-[260px]">
			<RadialProgressSeries data={usage} options={radialOptions} />
		</WickChart>
	</Card.Content>
</Card.Root>
