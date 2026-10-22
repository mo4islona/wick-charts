<script lang="ts">
	import {
		Crosshair,
		LineSeries,
		Marker,
		ReferenceLine,
		TimeAxis,
		type TimePoint,
		TimeRegion,
		Tooltip,
		YAxis,
	} from "@wick-charts/svelte";

	import * as Card from "$lib/registry/ui/card/index.js";
	import { WickChart } from "$lib/registry/ui/wick-chart/index.js";

	const MINUTE_MS = 60_000;
	const POINTS = 120;

	const formatPercent = (value: number) => `${value.toFixed(2)}%`;

	const axis = { y: { min: 0 } };
	// Headroom over the peaks, so the line stays below the region's label chip.
	const padding = { top: 40 };
	const lineOptions = { pulse: false };

	// Seeded, so every render shows the same picture.
	function seededRandom(seed: number): () => number {
		let state = seed;

		return () => {
			state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

			return state / 4_294_967_296;
		};
	}

	// Demo data: a calm error rate, a deploy, then an incident above the SLO. The baseline stays
	// flat and the deploy comes well before the spike, so the deploy callout hides no data.
	function makeErrors(): {
		points: TimePoint[];
		deployAt: number;
		incidentFrom: number;
		incidentTo: number;
	} {
		const random = seededRandom(11);
		const start = Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS - POINTS * MINUTE_MS;
		const incidentFrom = start + 70 * MINUTE_MS;
		const incidentTo = start + 88 * MINUTE_MS;
		const points: TimePoint[] = [];

		for (let minute = 0; minute < POINTS; minute++) {
			const time = start + minute * MINUTE_MS;
			const isIncident = time >= incidentFrom && time <= incidentTo;
			const value = isIncident ? 1.6 + random() * 1.2 : 0.42 + random() * 0.08;
			points.push({ time, value });
		}

		return { points, deployAt: incidentFrom - 24 * MINUTE_MS, incidentFrom, incidentTo };
	}

	const errors = makeErrors();
	const series = { label: "Errors", data: errors.points };
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Error rate</Card.Title>
		<Card.Description>5xx share of requests, last 2 hours</Card.Description>
	</Card.Header>
	<Card.Content>
		<WickChart class="aspect-auto h-[280px]" {axis} {padding}>
			<TimeRegion from={errors.incidentFrom} to={errors.incidentTo} label="incident" />
			<LineSeries id="errors" data={series} options={lineOptions} />
			<ReferenceLine value={1} label="SLO 1%" />
			<Marker time={errors.deployAt} seriesId="errors" shape="arrow-down" label="deploy v2.4" />
			<YAxis format={formatPercent} />
			<TimeAxis />
			<Crosshair />
			<Tooltip format={formatPercent} />
		</WickChart>
	</Card.Content>
</Card.Root>
