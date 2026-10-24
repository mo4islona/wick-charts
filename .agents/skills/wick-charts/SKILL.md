---
name: wick-charts
description: Build and change charts with the Wick Charts library (@wick-charts/react, @wick-charts/vue, @wick-charts/svelte, @wick-charts/nuxt) — candlestick, line, area, bar, band, heatmap, order book, sankey, pie and sparkline charts, live streaming data, tooltips, legends, annotations, axes, themes and the shadcn registry blocks. Use when the code imports @wick-charts/*, or when the user asks for one of these charts in React, Vue, Svelte or Nuxt.
---

# Wick Charts

Canvas charts for React, Vue 3, Svelte and Nuxt. This file has the install, a first chart, the rules every chart needs and a map of the other files. Before you write code for a task, read the file the map names for it.

## Install

```bash
npm install @wick-charts/react    # peers: react, react-dom >= 18
npm install @wick-charts/vue      # peer: vue >= 3.3
npm install @wick-charts/svelte   # peer: svelte 4 or 5
npx nuxi module add @wick-charts/nuxt
```

- Each framework package carries the whole engine; there is no `@wick-charts/core` package to install. Import components, types, themes and helpers from the framework package.
- A shadcn/ui, shadcn-vue or shadcn-svelte project installs the registry items instead: [shadcn.md](shadcn.md). Nuxt: [nuxt.md](nuxt.md).

## A first chart

`ChartContainer` is the root; series and overlays are its children.

```tsx
import { ChartContainer, Crosshair, LineSeries, TimeAxis, type TimePoint, Tooltip, YAxis } from '@wick-charts/react';

export function Revenue({ data }: { data: TimePoint[] }) {
  return (
    <div style={{ height: 320 }}>
      <ChartContainer>
        <LineSeries data={data} />
        <Tooltip />
        <Crosshair />
        <YAxis />
        <TimeAxis />
      </ChartContainer>
    </div>
  );
}
```

```vue
<script setup lang="ts">
import { ChartContainer, Crosshair, LineSeries, TimeAxis, type TimePoint, Tooltip, YAxis } from '@wick-charts/vue';

defineProps<{ data: TimePoint[] }>();
</script>

<template>
  <div style="height: 320px">
    <ChartContainer>
      <LineSeries :data="data" />
      <Tooltip />
      <Crosshair />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  </div>
</template>
```

```svelte
<script lang="ts">
  import { ChartContainer, Crosshair, LineSeries, TimeAxis, type TimePoint, Tooltip, YAxis } from '@wick-charts/svelte';

  let { data }: { data: TimePoint[] } = $props();
</script>

<div style="height: 320px">
  <ChartContainer>
    <LineSeries {data} />
    <Tooltip />
    <Crosshair />
    <YAxis />
    <TimeAxis />
  </ChartContainer>
</div>
```

## Rules every chart needs

- **Size.** `ChartContainer` fills its parent (`height: 100%`), so the parent needs a definite height. It also keeps a 240px `minHeight`: a smaller chart needs `minHeight: 0` in its `style` (Vue `style="height: 80px; min-height: 0"`, Svelte `style="min-height:0"`).
- **Theme.** The default theme is dark (`catppuccin`). On a light page pass a light one: `theme={githubLight.theme}` ([themes.md](themes.md)).
- **Time is epoch milliseconds** (`Date.now()`), or a `Date`. Epoch seconds draw near 1970, with a dev warning. On a numeric or category X axis, points carry `x` instead of `time` ([axes.md](axes.md)).
- **Updates are new arrays.** Pass a new `data` array for each change; the series finds the cheap path itself (a live last point, appended points, a rolling window, prepended history). React state must not mutate in place; Vue holds data in a `shallowRef`, Svelte 5 in `$state.raw` ([realtime.md](realtime.md)).
- **Series data shapes:**
  - `LineSeries`, `BarSeries`: `{ time, value }[]` for one layer, an array of them for several, or named layers `{ label?, color?, data }`.
  - `BandSeries`: the same shapes with `{ time, low, high }` points.
  - `CandlestickSeries`: `{ time, open, high, low, close, volume? }[]`, or `{ label, data }`.
  - `PieSeries`: `{ label, value, color? }[]`.
  - `HeatmapSeries`: `{ x, y, value }[]` cells.
  - `DepthSeries`: `bids` / `asks` as `[price, size][]`, not `data`.
  - `SankeySeries`: `nodes` and `links`, not `data`.
- **No `label` or `colors` option on `LineSeries` / `BarSeries`.** A layer's name and color ride in the data: `data={{ label: 'Revenue', color: '#22c55e', data: points }}`. A `color` can be a function of the value.
- **Give a series an `id`** when an overlay targets it (`YLabel seriesId`, `Marker seriesId`) or when your code reads it from the chart instance.
- **Create mappings and factories once.** `axis.y.scale` compares by identity: a `logScale()` or mapping object made on each render refits the Y range on each render. Make it at module scope or memoize it, and the same for the curve factories (`hermite()`, `spring()`).
- **Read at mount only:** `axis.x.type`, `viewport`, `interactive`, `perf` and the `onEdgeReached` callback. Remount the chart (a React `key`) to change them; in React, an `onEdgeReached` closure sees the state of the first render, so read state through a ref. A new `animations` value rebuilds the chart by itself.
- **Spatial series** (pie, heatmap, sankey) have no axes, no crosshair and no `Tooltip`: use `PieTooltip` / `PieLegend`, `HeatmapTooltip`, `SankeyTooltip`.
- **Axis types.** Candlestick needs a time X axis, depth a numeric one. `Navigator`, `EdgeLoader` and `TimeRegion` work on a time axis only.

## Props and options: read the installed types

This skill shows how the pieces fit and where the traps are. It does not list every prop and option: the installed type declarations do, with each default and doc comment, for the version that the project has. Read the declaration before you use a prop or option that this skill does not show. When the two disagree, the types win: the skill follows the latest release, and the project can have an older one.

| Package | Declarations |
|---|---|
| `@wick-charts/react` | `node_modules/@wick-charts/react/dist/index.d.ts` |
| `@wick-charts/vue` (also in a Nuxt app) | `node_modules/@wick-charts/vue/dist/index.d.ts` |
| `@wick-charts/svelte` | `node_modules/@wick-charts/svelte/dist/core/index.d.ts`; component props in `dist/<Series>.svelte.d.ts` and `dist/ui/<Overlay>.svelte.d.ts` |

```bash
T=node_modules/@wick-charts/react/dist/index.d.ts
# An interface or a class, with the doc comment of each field
awk '/(interface|class) LineSeriesOptions[ <{]/,/^}/' $T
# A type alias: find the line, then read from it
grep -n 'type StackingMode\b' $T
# A ChartInstance method (the class is long) with its doc comment
grep -n -B12 '^    setVisibleRange(' $T
```

- **Series options:** `LineSeriesOptions`, `BarSeriesOptions`, `CandlestickSeriesOptions`, `BandSeriesOptions`, `PieSeriesOptions`, `HeatmapSeriesOptions`, `DepthSeriesOptions`, `SankeySeriesOptions`. A series' `options` prop takes a `Partial` of one.
- **Component props:** `<Component>Props` — `ChartContainerProps`, `LineSeriesProps`, `TooltipProps`. In Svelte, read the component's `.svelte.d.ts`.
- **Config:** `AxisConfig` (`XAxisConfig`, `YAxisConfig`), `AnimationsConfig`, `ChartTheme`, `ThemeConfig` (the `createTheme` input), `MarkerConfig`, `ReferenceLineConfig`, `TimeRegionConfig`.
- **Data and slot payloads:** `TimePointInput`, `OHLCInput`, `BandPointInput`, `HeatmapCellInput`, `PieSliceData`, `SankeyNode`, `SankeyLink`, `DepthLevel`, `NavigatorData`, `SeriesSnapshot`, `LegendItem`, `HoverInfo`.
- A name that is not in the file means the package is older than this skill. Then use the API page of the component, `https://wick-charts.eeff.io/api/<component>/` (`/api/line-series/`, `/api/chart-container/`), or the API reference at the end of `https://wick-charts.eeff.io/llms-full.txt`. Those two also serve a reader without `node_modules`.

## Which file to read

| Task | File |
|---|---|
| Candlestick (OHLC), volume, indicators on price | [candlestick.md](candlestick.md) |
| Line or area chart, stacking, threshold colors, P&L baseline | [line.md](line.md) |
| Bar chart, histogram, grouped or stacked bars, value labels | [bar.md](bar.md) |
| Range band, percentile band, Bollinger, fan chart | [band.md](band.md) |
| Heatmap (a matrix of cells) | [heatmap.md](heatmap.md) |
| Order book (depth chart) | [depth.md](depth.md) |
| Sankey (flows between stages) | [sankey.md](sankey.md) |
| Pie or donut | [pie.md](pie.md) |
| Inline mini chart with a value (React) | [sparkline.md](sparkline.md) |
| `ChartContainer` props: padding, grid, header, viewport, fade, events, perf HUD | [chart-container.md](chart-container.md) |
| Y scales (log, a second scale), numeric and category X axes | [axes.md](axes.md) |
| Live data, history on scroll, `Navigator`, several synced charts | [realtime.md](realtime.md) |
| Tooltip, InfoBar, Legend, YLabel, number format, custom tooltip content | [overlays.md](overlays.md) |
| Markers, threshold lines, shaded time regions | [annotations.md](annotations.md) |
| Your own component inside a chart, the chart instance, events | [custom-overlays.md](custom-overlays.md) |
| Animation timings, intro styles | [animations.md](animations.md) |
| Themes, custom theme | [themes.md](themes.md) |
| shadcn/ui, shadcn-vue, shadcn-svelte | [shadcn.md](shadcn.md) |
| Nuxt | [nuxt.md](nuxt.md) |

## Framework differences

The components and their props are the same in the three frameworks; only the syntax differs (`:prop` in Vue, `{prop}` in Svelte).

- **React only:** `ThemeProvider`, `Sparkline`, `EdgeLoader`. The `onEdgeReached` prop of `ChartContainer` works in all three.
- **`ChartContainer` styling:** React takes `style` / `className`, Vue passes `style` / `class` to the root element, Svelte takes `style` as a string.
- **Callbacks** are props: React `onPointClick={fn}`, Vue `@point-click="fn"`, Svelte `onPointClick={fn}`.
- **Custom overlay content:** a React render-prop, a Vue scoped slot, a Svelte `let:` slot ([overlays.md](overlays.md#custom-content)).
- **Reactive reads** of chart state are hooks in React, composables with the same names in Vue and stores in Svelte ([custom-overlays.md](custom-overlays.md)).
- **Svelte 5:** the components work in runes and legacy mode. Write your own components with runes (`$props`, `$state.raw`, `$derived`); `$:` and `export let` do not compile in runes mode.
- **Svelte 4:** the examples in this skill use runes. In Svelte 4, take props with `export let data: TimePoint[]`, keep chart data in a plain `let`, and derive with `$:`.
- **Next.js:** the React package is marked `'use client'`, so a Server Component can render a chart. A function prop (`format`, a `color` function, a render-prop) cannot cross from a Server Component: put such a chart in your own `'use client'` file.

## No framework

`ChartInstance` has no framework dependency, and each framework package exports it with every series definition:

```ts
import { ChartInstance, LineSeriesDef } from '@wick-charts/react';

const chart = new ChartInstance(element); // element: a sized HTMLElement
const id = chart.addSeries(LineSeriesDef, {});
chart.setSeriesData(id, [{ time: Date.now(), value: 42 }]);
```

A page without a bundler loads `https://cdn.jsdelivr.net/npm/@wick-charts/react/dist/wick-charts.umd.min.js`, which defines the same API as the `WickCharts` global. Pin a version (`@wick-charts/react@x.y.z`) for production.

## Upgrades

Breaking changes and their code changes are in [MIGRATION.md](https://github.com/mo4islona/wick-charts/blob/main/MIGRATION.md). A `@deprecated` tag in the types names the replacement (for example `VisibleRange` → `XRange`).
