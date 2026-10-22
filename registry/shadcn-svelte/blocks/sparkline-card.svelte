<script lang="ts" module>
	export interface SparklineMetric {
		label: string;
		base: number;
		volatility: number;
		format: (value: number) => string;
		/** `true` when a falling value is the good direction, e.g. latency. */
		lowerIsBetter?: boolean;
	}
</script>

<script lang="ts">
	import { LineSeries, NumberFlow, type TimePoint } from "@wick-charts/svelte";
	import { onMount, untrack } from "svelte";

	import * as Card from "$lib/registry/ui/card/index.js";
	import { WickChart } from "$lib/registry/ui/wick-chart/index.js";

	let { metric }: { metric: SparklineMetric } = $props();

	const POINTS = 40;
	const TICK_MS = 1500;

	const axis = {
		y: { visible: false, width: 0 },
		x: { visible: false, height: 0 },
	};
	const padding = { top: 4, right: 0, bottom: 4, left: 0 };
	const grid = { visible: false };
	const viewport = { maxVisibleBars: POINTS };
	const lineOptions = { pulse: false };

	// Seeded, so the server render and the browser start from the same values.
	function seededRandom(seed: number): () => number {
		let state = seed;

		return () => {
			state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

			return state / 4_294_967_296;
		};
	}

	// Demo feed: a random walk pulled back toward the metric's base value.
	function nextPoint(
		previous: TimePoint,
		metric: SparklineMetric,
		random: () => number = Math.random
	): TimePoint {
		const drift = (metric.base - previous.value) * 0.08;
		const noise = (random() - 0.5) * 2 * metric.volatility * metric.base;

		return { time: previous.time + TICK_MS, value: previous.value + drift + noise };
	}

	function seedPoints(metric: SparklineMetric): TimePoint[] {
		const random = seededRandom(metric.base);
		let point: TimePoint = { time: Date.now() - POINTS * TICK_MS, value: metric.base };
		const points = [point];

		while (points.length < POINTS) {
			point = nextPoint(point, metric, random);
			points.push(point);
		}

		return points;
	}

	// The history is seeded once, from the first `metric`.
	let data = $state.raw(untrack(() => seedPoints(metric)));
	const series = $derived({ label: metric.label, data });
	const latest = $derived(data[data.length - 1]?.value ?? 0);
	const change = $derived.by(() => {
		const first = data[0]?.value ?? 0;
		if (first === 0) return 0;

		return ((latest - first) / first) * 100;
	});
	const isGood = $derived(metric.lowerIsBetter ? change <= 0 : change >= 0);
	const changeLabel = $derived(`${change >= 0 ? "+" : ""}${change.toFixed(1)}%`);

	onMount(() => {
		const timer = setInterval(() => {
			const last = data[data.length - 1];
			if (!last) return;

			data = [...data.slice(1), nextPoint(last, metric)];
		}, TICK_MS);

		return () => clearInterval(timer);
	});
</script>

<Card.Root class="gap-2 overflow-hidden pb-0">
	<Card.Header>
		<Card.Description>{metric.label}</Card.Description>
		<Card.Title>
			<div class="text-2xl font-semibold tabular-nums">
				<NumberFlow value={latest} format={metric.format} />
			</div>
		</Card.Title>
		<Card.Action
			class={isGood
				? "text-xs text-emerald-600 dark:text-emerald-400"
				: "text-xs text-red-600 dark:text-red-400"}
		>
			{changeLabel}
		</Card.Action>
	</Card.Header>
	<Card.Content class="px-0">
		<WickChart class="aspect-auto h-16" {axis} {padding} {grid} interactive={false} {viewport}>
			<LineSeries data={series} options={lineOptions} />
		</WickChart>
	</Card.Content>
</Card.Root>
