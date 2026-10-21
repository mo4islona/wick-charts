# Wick Charts

<!-- Generated from README.tmpl.md — edit the template, not this file. -->

[![codecov](https://codecov.io/gh/mo4islona/wick-charts/branch/main/graph/badge.svg)](https://codecov.io/gh/mo4islona/wick-charts) [![license](https://img.shields.io/github/license/mo4islona/wick-charts.svg)](./LICENSE)
[![npm @wick-charts/vue](https://img.shields.io/npm/v/@wick-charts/vue.svg?label=%40wick-charts%2Fvue)](https://www.npmjs.com/package/@wick-charts/vue)

Realtime, animated charts for **React**, **Vue** and **Svelte**. Canvas-rendered, tree-shakeable, zero runtime dependencies.

[Live demo](https://wick-charts.eeff.io/) · [Documentation](https://wick-charts.eeff.io/api/chart-container/) · [License](#license)

## Why Wick Charts

- **8+ chart types**: candlestick, line, bar, heatmap, pie and more, or [draw your own](https://wick-charts.eeff.io/use-cases/custom-renders/)
- **Real-time streaming** — append/update at 60fps with coordinated animations
- **Themes** — built-in themes, `createTheme()` for your own palette, and a [theme editor](https://wick-charts.eeff.io/use-cases/theme/)
- **Interactive** — zoom, pan, crosshair, tooltips
- **Stacking** — normal and percent modes for line/bar
- **Custom-render slots** — keep the built-in positioning, replace the contents
- **Tree-shakeable** — import only what you use
- **TypeScript-first** — type definitions ship with every package
- **Zero runtime dependencies** — just your framework
- **Always free and open** — [MIT licensed](#license)

## Install

```bash
npm install @wick-charts/vue
```

## Quick start

```vue
<script setup lang="ts">
import {
  ChartContainer, CandlestickSeries, Tooltip,
  Crosshair, YAxis, TimeAxis, type OHLCInput
} from '@wick-charts/vue';

defineProps<{ data: OHLCInput[] }>();
</script>

<template>
  <ChartContainer>
    <CandlestickSeries :data="data" />
    <Tooltip />
    <Crosshair />
    <YAxis />
    <TimeAxis />
  </ChartContainer>
</template>
```

`ChartContainer` fills its parent (`width` and `height` are `100%`), so give the parent a height. The container also has a 240px `min-height`, so a parent with no height still shows a chart. For a smaller chart, such as a sparkline in a table row, set `min-height: 0` (`minHeight: 0` in React) in the container's `style`.

Each chart page listed below has a Code tab next to its controls: copy, paste, ship.

## Live data

When the data changes, pass a new array to `data`. The series compares it with the previous array: a changed last point eases to its new value, a few new points are appended, anything else replaces the data. The [Realtime Data guide](https://wick-charts.eeff.io/use-cases/realtime-data/) shows both this and the imperative `appendData` / `updateData` calls.

- **Vue:** keep large datasets in a `shallowRef` and assign a new array: `data.value = [...data.value, point]`. A deep `ref` wraps every point in a proxy. `triggerRef` after an in-place `push` does not reach the chart.

## Chart types

- [Candlestick](https://wick-charts.eeff.io/charts/candlestick/) · [Order book](https://wick-charts.eeff.io/charts/depth/)
- [Line & Area](https://wick-charts.eeff.io/charts/line/) · [Band](https://wick-charts.eeff.io/charts/band/) · [Bar](https://wick-charts.eeff.io/charts/bar/)
- [Pie & Donut](https://wick-charts.eeff.io/charts/pie/) · [Heatmap](https://wick-charts.eeff.io/charts/heatmap/)
- [Sparkline](https://wick-charts.eeff.io/charts/sparkline/)

Put them on [numeric](https://wick-charts.eeff.io/use-cases/x-axis-types/) or [category](https://wick-charts.eeff.io/use-cases/category-bars/) X axes or a [secondary Y scale](https://wick-charts.eeff.io/use-cases/secondary-scale/), [sync several charts](https://wick-charts.eeff.io/use-cases/multi-chart-sync/), stream them [in real time](https://wick-charts.eeff.io/use-cases/realtime-data/), or [draw your own](https://wick-charts.eeff.io/use-cases/custom-renders/).

## No framework? Use the engine directly

`ChartInstance` and every series/theme/painter has no framework dependency — it's a plain canvas engine that each of `@wick-charts/react`, `@wick-charts/vue`, and `@wick-charts/svelte` bundles and re-exports in full. Any one of them is a supported vanilla entry point; you don't need React/Vue/Svelte installed to use it this way (`sideEffects: false` + per-module ESM means the framework-specific components tree-shake out when unused):

```ts
import { CandlestickSeriesDef, ChartInstance, type OHLCInput } from '@wick-charts/react';

const el = document.getElementById('chart');
if (!el) throw new Error('No #chart element');

const data: OHLCInput[] = [
  { time: Date.now() - 60_000, open: 100, high: 104, low: 98, close: 103 },
  { time: Date.now(), open: 103, high: 107, low: 101, close: 102 },
];

const chart = new ChartInstance(el);
const seriesId = chart.addSeries(CandlestickSeriesDef, {});
chart.setSeriesData(seriesId, data);
```

There's no separate `@wick-charts/core` package on npm — the three framework packages are the supported way to install the engine.

### Drop-in `<script>` — no build step

For a CodePen, JSFiddle, or a plain HTML page, load the prebuilt UMD bundle from a CDN — no npm, no bundler. It exposes the whole engine (every `ChartInstance`, series def, theme, and painter) as a `WickCharts` global:

```html
<div id="chart" style="width: 640px; height: 320px"></div>

<script src="https://cdn.jsdelivr.net/npm/@wick-charts/react/dist/wick-charts.umd.min.js"></script>
<script>
  const { ChartInstance, LineSeriesDef } = WickCharts;

  const chart = new ChartInstance(document.getElementById('chart'));
  const id = chart.addSeries(LineSeriesDef);
  chart.setLayerColors(id, ['#22c55e']);
  chart.setSeriesData(id, [
    { time: Date.now() - 2 * 86_400_000, value: 100 },
    { time: Date.now() - 86_400_000, value: 118 },
    { time: Date.now(), value: 109 },
  ]);
</script>
```

The same file is on unpkg (`https://unpkg.com/@wick-charts/react/dist/wick-charts.umd.min.js`); pin a version with `@x.y.z` for production. ~96 kB gzipped, self-contained.

## Bundle size: ship only what you use

Packages ship per-module ESM with `sideEffects: false`, and each series component carries its own renderer — your bundler only ships the chart types you import.

Tree-shaken React scenarios via `pnpm size` (esbuild, minified, browser target, React/ReactDOM external):

| Scenario | Raw | Gzip | Brotli |
|---|---:|---:|---:|
| Candlestick only | 146.3 kB | 45.9 kB | 40.2 kB |
| Line only        | 170.1 kB | 53.0 kB | 46.1 kB |
| Full React       | 331.8 kB | 103.0 kB | 86.2 kB |

## Measure performance

Pass `perfHud()` to the `perf` prop to put a small FPS panel on the chart. Click the panel to see frame times, draw calls and the render time of each series.

```vue
<script setup lang="ts">
import { ChartContainer, perfHud } from '@wick-charts/vue';

const hud = perfHud();
</script>

<template>
  <ChartContainer :perf="hud">
    <!-- series and overlays -->
  </ChartContainer>
</template>
```

The chart reads `perf` once, when it mounts. The perf code is in your bundle only if you import `perfHud`. To collect the numbers without the panel, pass a `PerfMonitor` instead and read them with `monitor.onFrame((stats) => …)`.

## Documentation

Every component, prop, type, and slot context lives in the docs site. Start at [ChartContainer](https://wick-charts.eeff.io/api/chart-container/), then pick a series or an overlay in the sidebar.

## Migration

Upgrading across versions? See [MIGRATION.md](https://github.com/mo4islona/wick-charts/blob/main/MIGRATION.md) for per-version breaking-change notes and code snippets.

## Contributing

Bug reports, feature requests and pull requests are welcome. Open an [issue](https://github.com/mo4islona/wick-charts/issues) first for anything larger than a small fix, so we can agree on the approach.

```bash
pnpm install
pnpm dev         # docs site with every chart type at http://localhost:5173
pnpm test        # unit and integration tests
pnpm lint        # Biome
pnpm typecheck
```

A pull request should pass `pnpm test`, `pnpm lint` and `pnpm typecheck`, and add a test for each bug fix.

## License

MIT — always free and open.