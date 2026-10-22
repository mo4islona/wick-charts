<script lang="ts">
	import { NumberFlow, PieSeries, type PieSliceData, PieTooltip } from "@wick-charts/svelte";
	import { onMount } from "svelte";

	import * as Card from "$lib/registry/ui/card/index.js";
	import { WickChart } from "$lib/registry/ui/wick-chart/index.js";

	const TICK_MS = 2000;

	const initialBrowsers: PieSliceData[] = [
		{ label: "Chrome", value: 275 },
		{ label: "Safari", value: 200 },
		{ label: "Firefox", value: 187 },
		{ label: "Edge", value: 173 },
		{ label: "Other", value: 90 },
	];

	const pieOptions = {
		innerRadiusRatio: 0.62,
		sliceLabels: { mode: "none" as const },
	};

	// Demo feed: a few new visits land on random browsers every tick.
	function addVisits(slices: PieSliceData[]): PieSliceData[] {
		return slices.map((slice) => ({
			...slice,
			value: slice.value + Math.round(Math.random() * 6),
		}));
	}

	let browsers = $state.raw(initialBrowsers);
	const total = $derived(browsers.reduce((sum, slice) => sum + slice.value, 0));

	onMount(() => {
		const timer = setInterval(() => {
			browsers = addVisits(browsers);
		}, TICK_MS);

		return () => clearInterval(timer);
	});
</script>

<Card.Root>
	<Card.Header class="items-center text-center">
		<Card.Title>Visitors by browser</Card.Title>
		<Card.Description>Today, live</Card.Description>
	</Card.Header>
	<Card.Content>
		<div class="relative">
			<!-- Under the chart, so the tooltip stays on top; the donut hole is transparent. -->
			<div class="absolute inset-0 flex flex-col items-center justify-center">
				<div class="text-3xl font-bold tabular-nums">
					<NumberFlow value={total} />
				</div>
				<span class="text-xs text-muted-foreground">Visitors</span>
			</div>
			<WickChart class="relative aspect-auto h-[280px]">
				<PieSeries data={browsers} options={pieOptions} />
				<PieTooltip />
			</WickChart>
		</div>
	</Card.Content>
</Card.Root>
