# Wick Charts

[![codecov](https://codecov.io/gh/mo4islona/wick-charts/branch/main/graph/badge.svg)](https://codecov.io/gh/mo4islona/wick-charts) [![license](https://img.shields.io/github/license/mo4islona/wick-charts.svg)](./LICENSE)
<!-- @only:react -->
[![npm @wick-charts/react](https://img.shields.io/npm/v/@wick-charts/react.svg?label=%40wick-charts%2Freact)](https://www.npmjs.com/package/@wick-charts/react)
<!-- @/only -->
<!-- @only:vue -->
[![npm @wick-charts/vue](https://img.shields.io/npm/v/@wick-charts/vue.svg?label=%40wick-charts%2Fvue)](https://www.npmjs.com/package/@wick-charts/vue)
<!-- @/only -->
<!-- @only:svelte -->
[![npm @wick-charts/svelte](https://img.shields.io/npm/v/@wick-charts/svelte.svg?label=%40wick-charts%2Fsvelte)](https://www.npmjs.com/package/@wick-charts/svelte)
<!-- @/only -->

High-performance timeseries charts for **React**, **Vue**, and **Svelte**. Canvas-rendered, tree-shakeable, zero runtime dependencies.

[Live Demo](https://wick-charts.eeff.io/) · [Docs](https://wick-charts.eeff.io/api/chart-container)

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

<!-- @install -->
```bash
npm install @wick-charts/react   # React
npm install @wick-charts/vue     # Vue
npm install @wick-charts/svelte  # Svelte
```
<!-- @/install -->

## Quick Start

<!-- @fw:react -->
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
<!-- @/fw -->
<!-- @fw:vue -->
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
<!-- @/fw -->
<!-- @fw:svelte -->
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
<!-- @/fw -->

## API

Every component, prop, type, and slot context lives in the docs site:

[wick-charts.eeff.io/api/chart-container](https://wick-charts.eeff.io/api/chart-container)

Start there for [ChartContainer](https://wick-charts.eeff.io/api/chart-container), then drill into the series ([Candlestick](https://wick-charts.eeff.io/api/candlestick-series), [Line](https://wick-charts.eeff.io/api/line-series), [Bar](https://wick-charts.eeff.io/api/bar-series), [Pie](https://wick-charts.eeff.io/api/pie-series), [Sparkline](https://wick-charts.eeff.io/api/sparkline)) and overlays ([Tooltip](https://wick-charts.eeff.io/api/tooltip), [InfoBar](https://wick-charts.eeff.io/api/info-bar), [Crosshair](https://wick-charts.eeff.io/api/crosshair), [Legend](https://wick-charts.eeff.io/api/legend), [YAxis](https://wick-charts.eeff.io/api/y-axis), [XAxis](https://wick-charts.eeff.io/api/x-axis), [Navigator](https://wick-charts.eeff.io/api/navigator), …).

## Bundle size

Tree-shaken React scenarios via `pnpm size` (esbuild, minified, browser target, React/ReactDOM external):

| Scenario | Raw | Gzip | Brotli |
|---|---:|---:|---:|
| Candlestick only | 165.2 kB | 49.5 kB | 42.3 kB |
| Line only        | 165.3 kB | 49.5 kB | 42.4 kB |
| Full React       | 183.3 kB | 54.6 kB | 46.5 kB |

## Migration

Upgrading across versions? See [MIGRATION.md](./MIGRATION.md) for per-version breaking-change notes and code snippets.

## License

MIT
