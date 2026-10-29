<script lang="ts">
	import {
		Crosshair,
		type DepthLevel,
		DepthSeries,
		NumberFlow,
		Tooltip,
		XAxis,
		YAxis,
		formatSignificant,
	} from "@wick-charts/svelte";
	import { onMount } from "svelte";

	import * as Card from "$lib/registry/ui/card/index.js";
	import { WickChart } from "$lib/registry/ui/wick-chart/index.js";

	const LEVELS = 40;
	const TICK_SIZE = 0.5;
	const TICK_MS = 1000;

	interface Book {
		mid: number;
		bids: DepthLevel[];
		asks: DepthLevel[];
	}

	// The mid price format; change it for your market. Below 1, `formatSignificant` keeps
	// the digits a small price needs (0.0₆95), as the library default does.
	const formatPrice = (value: number) =>
		Math.abs(value) < 1
			? formatSignificant(value)
			: value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

	const axis = { x: { type: "numeric" as const }, y: { min: 0 } };

	// Seeded, so the server render and the browser start from the same book.
	function seededRandom(seed: number): () => number {
		let state = seed;

		return () => {
			state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

			return state / 4_294_967_296;
		};
	}

	// Demo feed: the mid drifts and every level gets a fresh size each tick.
	function levelSize(distance: number, random: () => number): number {
		return (0.4 + distance * 0.08) * (0.5 + random());
	}

	function makeBook(mid: number, random: () => number = Math.random): Book {
		const bids: DepthLevel[] = [];
		const asks: DepthLevel[] = [];

		for (let i = 1; i <= LEVELS; i++) {
			bids.push([mid - i * TICK_SIZE, levelSize(i, random)]);
			asks.push([mid + i * TICK_SIZE, levelSize(i, random)]);
		}

		return { mid, bids, asks };
	}

	function nextBook(book: Book): Book {
		const step = Math.round((Math.random() - 0.5) * 2) * TICK_SIZE;

		return makeBook(book.mid + step);
	}

	let book = $state.raw(makeBook(3_450, seededRandom(3_450)));

	onMount(() => {
		const timer = setInterval(() => {
			book = nextBook(book);
		}, TICK_MS);

		return () => clearInterval(timer);
	});
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>ETH / USD order book</Card.Title>
		<Card.Description>Cumulative depth, {LEVELS} levels a side</Card.Description>
		<Card.Action class="text-right">
			<div class="text-2xl font-semibold tabular-nums">
				<NumberFlow value={book.mid} format={formatPrice} />
			</div>
			<div class="text-xs text-muted-foreground">mid</div>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		<WickChart class="aspect-auto h-[280px]" {axis}>
			<DepthSeries bids={book.bids} asks={book.asks} />
			<XAxis />
			<YAxis />
			<Crosshair />
			<Tooltip />
		</WickChart>
	</Card.Content>
</Card.Root>
