<!--
  @component
  Wick Charts `ChartContainer` themed from the shadcn-svelte CSS variables. Size it
  with classes, like the shadcn `Chart.Container`: `aspect-video` by default,
  `aspect-auto h-[250px]` for a fixed height. Horizontal grid lines only, as in
  shadcn charts; pass `grid` to change it. Every other prop goes to `ChartContainer`.
-->
<script lang="ts">
	import { ChartContainer, type ChartTheme } from "@wick-charts/svelte";
	import type { ComponentProps, Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";

	import { useWickTheme } from "$lib/registry/hooks/wick-theme.svelte.js";
	import { cn } from "$lib/utils.js";

	type WickChartProps = Omit<ComponentProps<ChartContainer>, "theme"> & {
		class?: HTMLAttributes<HTMLDivElement>["class"];
		/** A theme, or a function that adjusts the theme built from the CSS variables. */
		theme?: ChartTheme | ((theme: ChartTheme) => ChartTheme);
		children?: Snippet;
	};

	let {
		class: className,
		theme,
		grid = { vertical: false },
		children,
		...restProps
	}: WickChartProps = $props();

	let root = $state<HTMLDivElement | null>(null);
	const wickTheme = useWickTheme(() => root);
	const chartTheme = $derived(
		typeof theme === "function" ? theme(wickTheme.current) : (theme ?? wickTheme.current)
	);
</script>

<div bind:this={root} data-slot="wick-chart" class={cn("flex aspect-video w-full", className)}>
	<ChartContainer
		style="min-height: 0; background: transparent"
		{...restProps}
		theme={chartTheme}
		{grid}
	>
		{@render children?.()}
	</ChartContainer>
</div>
