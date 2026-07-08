# Wick Charts

<!-- Generated from README.tmpl.md — edit the template, not this file. -->

[![codecov](https://codecov.io/gh/mo4islona/wick-charts/branch/main/graph/badge.svg)](https://codecov.io/gh/mo4islona/wick-charts) [![license](https://img.shields.io/github/license/mo4islona/wick-charts.svg)](./LICENSE)
[![npm @wick-charts/react](https://img.shields.io/npm/v/@wick-charts/react.svg?label=%40wick-charts%2Freact)](https://www.npmjs.com/package/@wick-charts/react)
[![npm @wick-charts/vue](https://img.shields.io/npm/v/@wick-charts/vue.svg?label=%40wick-charts%2Fvue)](https://www.npmjs.com/package/@wick-charts/vue)
[![npm @wick-charts/svelte](https://img.shields.io/npm/v/@wick-charts/svelte.svg?label=%40wick-charts%2Fsvelte)](https://www.npmjs.com/package/@wick-charts/svelte)

High-performance timeseries charts for **React**, **Vue**, and **Svelte**. Canvas-rendered, tree-shakeable, zero runtime dependencies.

[Live Demo](https://wick-charts.eeff.io/) · [Docs](https://wick-charts.eeff.io/api/chart-container/)

## Features

- **Candlestick, Line, Bar, Pie, Sparkline** — all from one package
- **Real-time streaming** — append/update at 60fps with coordinated animations
- **22 built-in themes** plus `createTheme()` for custom palettes
- **Interactive** — zoom, pan, crosshair, tooltips
- **Stacking** — normal and percent modes for line/bar
- **Custom-render slots** — keep the built-in positioning, replace the contents
- **Tree-shakeable** — import only what you use
- **Zero runtime dependencies** — just your framework

## Install

```bash
npm install @wick-charts/react   # React
npm install @wick-charts/vue     # Vue
npm install @wick-charts/svelte  # Svelte
```

## Quick Start

```tsx
import {
  ChartContainer, CandlestickSeries, Tooltip,
  Crosshair, YAxis, TimeAxis
} from '@wick-charts/react';

function Chart({ data }) {
  return (
    <ChartContainer>
      <CandlestickSeries data={data} />
      <Tooltip />
      <Crosshair />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}
```

<details>
<summary>Vue</summary>

```vue
<script setup>
import {
  ChartContainer, CandlestickSeries, Tooltip,
  Crosshair, YAxis, TimeAxis
} from '@wick-charts/vue';

const props = defineProps(['data']);
</script>

<template>
  <ChartContainer>
    <CandlestickSeries :data="props.data" />
    <Tooltip />
    <Crosshair />
    <YAxis />
    <TimeAxis />
  </ChartContainer>
</template>
```

</details>

<details>
<summary>Svelte</summary>

```svelte
<script>
  import {
    ChartContainer, CandlestickSeries, Tooltip,
    Crosshair, YAxis, TimeAxis
  } from '@wick-charts/svelte';

  export let data = [];
</script>

<ChartContainer>
  <CandlestickSeries {data} />
  <Tooltip />
  <Crosshair />
  <YAxis />
  <TimeAxis />
</ChartContainer>
```

</details>

## API

Every component, prop, type, and slot context lives in the docs site:

[wick-charts.eeff.io/api/chart-container/](https://wick-charts.eeff.io/api/chart-container/)

Start there for [ChartContainer](https://wick-charts.eeff.io/api/chart-container/), then drill into the series ([Candlestick](https://wick-charts.eeff.io/api/candlestick-series/), [Line](https://wick-charts.eeff.io/api/line-series/), [Bar](https://wick-charts.eeff.io/api/bar-series/), [Pie](https://wick-charts.eeff.io/api/pie-series/), [Sparkline](https://wick-charts.eeff.io/api/sparkline/)) and overlays ([Tooltip](https://wick-charts.eeff.io/api/tooltip/), [InfoBar](https://wick-charts.eeff.io/api/info-bar/), [Crosshair](https://wick-charts.eeff.io/api/crosshair/), [Legend](https://wick-charts.eeff.io/api/legend/), [YAxis](https://wick-charts.eeff.io/api/y-axis/), [XAxis](https://wick-charts.eeff.io/api/x-axis/), [Navigator](https://wick-charts.eeff.io/api/navigator/), …).

## No framework? Use the engine directly

`ChartInstance` and every series/theme/painter has no framework dependency — it's a plain canvas engine that each of `@wick-charts/react`, `@wick-charts/vue`, and `@wick-charts/svelte` bundles and re-exports in full. Any one of them is a supported vanilla entry point; you don't need React/Vue/Svelte installed to use it this way (`sideEffects: false` + per-module ESM means the framework-specific components tree-shake out when unused):

```ts
import { CandlestickSeriesDef, ChartInstance, registerBuiltinSeries } from '@wick-charts/react';

registerBuiltinSeries();
const chart = new ChartInstance(document.getElementById('chart')!);
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

The same file is on unpkg (`https://unpkg.com/@wick-charts/react/dist/wick-charts.umd.min.js`); pin a version with `@x.y.z` for production. ~72 kB gzipped, self-contained.

## Bundle size

Packages ship per-module ESM with `sideEffects: false`, and each series component carries its own renderer — your bundler only ships the chart types you import.

Tree-shaken React scenarios via `pnpm size` (esbuild, minified, browser target, React/ReactDOM external):

| Scenario | Raw | Gzip | Brotli |
|---|---:|---:|---:|
| Candlestick only | 109.8 kB | 34.1 kB | 30.0 kB |
| Line only        | 125.6 kB | 38.7 kB | 33.8 kB |
| Full React       | 253.5 kB | 78.1 kB | 65.6 kB |

## Migration

Upgrading across versions? See [MIGRATION.md](./MIGRATION.md) for per-version breaking-change notes and code snippets.

## License

MIT