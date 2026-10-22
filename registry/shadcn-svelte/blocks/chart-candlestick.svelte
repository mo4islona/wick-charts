<script lang="ts">
	import {
		CandlestickSeries,
		Crosshair,
		InfoBar,
		NumberFlow,
		type OHLCData,
		TimeAxis,
		YAxis,
		YLabel,
		formatSignificant,
	} from "@wick-charts/svelte";
	import { onMount } from "svelte";

	import * as Card from "$lib/registry/ui/card/index.js";
	import { WickChart } from "$lib/registry/ui/wick-chart/index.js";

	const CANDLE_MS = 5000;
	const TICK_MS = 500;
	const HISTORY = 80;

	// The block's price formats; change them for your market. Below 1, `formatSignificant` keeps
	// the digits a small price needs (0.0₆95), as the library default does.
	const formatPrice = (value: number) =>
		Math.abs(value) < 1
			? formatSignificant(value)
			: value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

	// Inside the chart, prices from 1,000 up drop the cents, so the axis column and the OHLC row fit a phone.
	const formatChartPrice = (value: number) =>
		Math.abs(value) < 1000
			? formatSignificant(value)
			: value.toLocaleString("en-US", { maximumFractionDigits: 0 });

	const viewport = { initialRange: 48 };
	const candleOptions = { bodyWidthRatio: 0.7 };

	// Seeded, so the server render and the browser start from the same candles.
	function seededRandom(seed: number): () => number {
		let state = seed;

		return () => {
			state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

			return state / 4_294_967_296;
		};
	}

	// Demo feed: each tick moves the last candle, a new candle opens every 5 s.
	function openCandle(time: number, price: number): OHLCData {
		return { time, open: price, high: price, low: price, close: price };
	}

	function tradeInto(candle: OHLCData, random: () => number = Math.random): OHLCData {
		const close = candle.close * (1 + (random() - 0.5) * 0.002);

		return {
			...candle,
			close,
			high: Math.max(candle.high, close),
			low: Math.min(candle.low, close),
		};
	}

	function seedCandles(): OHLCData[] {
		const start = Math.floor(Date.now() / CANDLE_MS) * CANDLE_MS - HISTORY * CANDLE_MS;
		const candles: OHLCData[] = [];
		const random = seededRandom(7);
		let price = 68_000;

		for (let i = 0; i < HISTORY; i++) {
			let candle = openCandle(start + i * CANDLE_MS, price);
			for (let trade = 0; trade < CANDLE_MS / TICK_MS; trade++) {
				candle = tradeInto(candle, random);
			}

			candles.push(candle);
			price = candle.close;
		}

		return candles;
	}

	function nextCandles(previous: OHLCData[]): OHLCData[] {
		const last = previous[previous.length - 1];
		if (!last) return previous;

		const isNewCandle = Date.now() >= last.time + CANDLE_MS;
		if (isNewCandle) {
			return [...previous.slice(1), tradeInto(openCandle(last.time + CANDLE_MS, last.close))];
		}

		return [...previous.slice(0, -1), tradeInto(last)];
	}

	let candles = $state.raw(seedCandles());
	const series = $derived({ label: "BTC", data: candles });
	const latest = $derived(candles[candles.length - 1]?.close ?? 0);
	const change = $derived.by(() => {
		const first = candles[0]?.open ?? 0;
		if (first === 0) return 0;

		return ((latest - first) / first) * 100;
	});
	const changeLabel = $derived(`${change >= 0 ? "+" : ""}${change.toFixed(2)}%`);

	onMount(() => {
		const timer = setInterval(() => {
			candles = nextCandles(candles);
		}, TICK_MS);

		return () => clearInterval(timer);
	});
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>BTC / USD</Card.Title>
		<Card.Description>5-second candles, simulated feed</Card.Description>
		<Card.Action class="text-right">
			<div class="text-2xl font-semibold tabular-nums">
				<NumberFlow value={latest} format={formatPrice} />
			</div>
			<div
				class={change >= 0
					? "text-xs text-emerald-600 dark:text-emerald-400"
					: "text-xs text-red-600 dark:text-red-400"}
			>
				{changeLabel}
			</div>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		<WickChart class="aspect-auto h-[280px]" {viewport}>
			<InfoBar format={formatChartPrice} />
			<CandlestickSeries data={series} options={candleOptions} />
			<YAxis format={formatChartPrice} />
			<TimeAxis />
			<Crosshair />
			<YLabel />
		</WickChart>
	</Card.Content>
</Card.Root>
