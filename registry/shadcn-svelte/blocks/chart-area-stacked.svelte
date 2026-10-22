<script lang="ts">
	import {
		Crosshair,
		Legend,
		LineSeries,
		TimeAxis,
		type TimePoint,
		Tooltip,
		YAxis,
	} from "@wick-charts/svelte";

	import * as Card from "$lib/registry/ui/card/index.js";
	import { WickChart } from "$lib/registry/ui/wick-chart/index.js";

	const DAY_MS = 86_400_000;
	const DAYS = 90;

	const formatCount = (value: number) => Math.round(value).toLocaleString("en-US");

	const areaOptions = { stacking: "normal" as const, pulse: false };

	// Seeded, so the server render and the browser show the same total.
	function seededRandom(seed: number): () => number {
		let state = seed;

		return () => {
			state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

			return state / 4_294_967_296;
		};
	}

	// Demo data: daily visitors with a weekly rhythm. Replace with your own series.
	function makeVisitors(): { desktop: TimePoint[]; mobile: TimePoint[] } {
		const random = seededRandom(3);
		const start = Math.floor(Date.now() / DAY_MS) * DAY_MS - DAYS * DAY_MS;
		const desktop: TimePoint[] = [];
		const mobile: TimePoint[] = [];

		for (let day = 0; day < DAYS; day++) {
			const time = start + day * DAY_MS;
			const weekly = Math.sin((day / 7) * Math.PI * 2) * 40;
			desktop.push({ time, value: Math.round(220 + weekly + day * 1.2 + random() * 80) });
			mobile.push({ time, value: Math.round(160 - weekly * 0.6 + day * 0.8 + random() * 60) });
		}

		return { desktop, mobile };
	}

	const visitors = makeVisitors();
	// The first layer sits at the bottom of the stack.
	const series = [
		{ label: "Mobile", data: visitors.mobile },
		{ label: "Desktop", data: visitors.desktop },
	];
	const total = series.reduce(
		(sum, layer) => sum + layer.data.reduce((layerSum, point) => layerSum + point.value, 0),
		0
	);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Visitors</Card.Title>
		<Card.Description>Desktop and mobile, last 3 months</Card.Description>
		<Card.Action class="text-right">
			<div class="text-2xl font-semibold tabular-nums">{formatCount(total)}</div>
			<div class="text-xs text-muted-foreground">total</div>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		<WickChart class="aspect-auto h-[280px]">
			<LineSeries data={series} options={areaOptions} />
			<YAxis format={formatCount} />
			<TimeAxis />
			<Crosshair />
			<Tooltip format={formatCount} />
			<Legend />
		</WickChart>
	</Card.Content>
</Card.Root>
