<script lang="ts">
	import {
		Crosshair,
		LineSeries,
		NumberFlow,
		TimeAxis,
		type TimePoint,
		Tooltip,
		YAxis,
	} from "@wick-charts/svelte";
	import { onMount } from "svelte";

	import * as Card from "$lib/registry/ui/card/index.js";
	import { WickChart } from "$lib/registry/ui/wick-chart/index.js";

	const POINTS = 120;
	const TICK_MS = 1000;

	const formatRate = (value: number) => Math.round(value).toLocaleString("en-US");

	const viewport = { maxVisibleBars: POINTS };

	// Demo feed: replace with your own stream and assign a new array on each update.
	function nextPoint(previous: TimePoint): TimePoint {
		const drift = (1200 - previous.value) * 0.05;
		const value = Math.max(0, previous.value + drift + (Math.random() - 0.5) * 120);

		return { time: previous.time + TICK_MS, value };
	}

	function seedPoints(): TimePoint[] {
		let point: TimePoint = { time: Date.now() - POINTS * TICK_MS, value: 1200 };
		const points = [point];

		while (points.length < POINTS) {
			point = nextPoint(point);
			points.push(point);
		}

		return points;
	}

	let data = $state.raw(seedPoints());
	const series = $derived({ label: "Requests", data });
	const latest = $derived(data[data.length - 1]?.value ?? 0);

	onMount(() => {
		const timer = setInterval(() => {
			const last = data[data.length - 1];
			if (!last) return;

			data = [...data.slice(1), nextPoint(last)];
		}, TICK_MS);

		return () => clearInterval(timer);
	});
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Live traffic</Card.Title>
		<Card.Description>Requests per second, last 2 minutes</Card.Description>
		<Card.Action class="text-right">
			<div class="text-2xl font-semibold tabular-nums">
				<NumberFlow value={latest} format={formatRate} />
			</div>
			<div class="text-xs text-muted-foreground">req/s</div>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		<WickChart class="aspect-auto h-[280px]" {viewport}>
			<LineSeries data={series} />
			<YAxis format={formatRate} />
			<TimeAxis />
			<Crosshair />
			<Tooltip format={formatRate} />
		</WickChart>
	</Card.Content>
</Card.Root>
