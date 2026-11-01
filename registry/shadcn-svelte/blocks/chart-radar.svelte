<script lang="ts">
	import { Legend, type RadarLayer, RadarSeries } from "@wick-charts/svelte";

	import * as Card from "$lib/registry/ui/card/index.js";
	import { WickChart } from "$lib/registry/ui/wick-chart/index.js";

	const axes = ["Reasoning", "Coding", "Math", "Writing", "Vision", "Speed"];

	const models: RadarLayer[] = [
		{ label: "Atlas", data: [92, 88, 85, 79, 71, 54] },
		{ label: "Nova", data: [78, 82, 70, 88, 84, 76] },
	];

	const radarOptions = { max: 100 };
</script>

<Card.Root>
	<Card.Header class="items-center text-center">
		<Card.Title>Model comparison</Card.Title>
		<Card.Description>Benchmark scores, out of 100</Card.Description>
	</Card.Header>
	<Card.Content>
		<WickChart class="aspect-auto h-[300px]">
			<RadarSeries {axes} data={models} options={radarOptions} />
			<Legend />
		</WickChart>
	</Card.Content>
</Card.Root>
