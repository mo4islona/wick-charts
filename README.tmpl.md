# Wick Charts

High-performance timeseries charts for **React**, **Vue**, and **Svelte**. Canvas-rendered, tree-shakeable, ~36KB gzipped when tree-shaken.

[Live Demo](https://mo4islona.github.io/wick-charts/)

## Features

- **Candlestick, Line, Bar, Pie** — all from one package
- **Real-time streaming** — append/update data at 60fps
- **22 built-in themes** — dark, light, and custom
- **Interactive** — zoom, pan, crosshair, tooltips
- **Stacking** — normal and percent modes for line/bar
- **Custom-render helpers** — `buildHoverSnapshots` / `buildLastSnapshots` / `computeTooltipPosition` for overlays that need to escape the built-in UI (structural-equality cache included)
- **Tree-shakeable** — import only what you use
- **Zero dependencies** — just your framework

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

## Series Types

| Component | Data Format | Description |
|---|---|---|
| `CandlestickSeries` | `{ time, open, high, low, close, volume? }[]` | OHLC candlesticks with volume bars |
| `LineSeries` | `{ time, value }[][]` | Line/area charts, multi-layer, stacking |
| `BarSeries` | `{ time, value }[][]` | Histogram/bar charts, stacking |
| `PieSeries` | `{ label, value, color? }[]` | Pie and donut charts |

## UI Overlays

Every DOM overlay ships a default UI **and** a scoped slot / render-prop so you can replace the contents with your own layout. Positioning, crosshair wiring, and data computation stay in the library — the slot just hands you the already-computed data.

| Component | Description | Slot ctx |
|---|---|---|
| `Tooltip` | Floating glass tooltip near cursor on hover | `{ snapshots, time }` |
| `InfoBar` | Compact OHLC / values info bar hoisted above the canvas | `{ snapshots, time, isHover }` |
| `Title` | Chart title / subtitle bar hoisted above the canvas | — |
| `Crosshair` | Axis labels at cursor position | — |
| `YAxis` | Vertical price/value axis with animated ticks | — |
| `TimeAxis` | Horizontal time axis with animated ticks | — |
| `YLabel` | Floating price badge with dashed line | `{ value, y, bgColor, isLive, direction, format }` |
| `Legend` | Clickable legend with toggle/isolate modes | `{ items: LegendItem[] }` |
| `PieTooltip` | Tooltip for pie/donut hover | `{ info, format }` |
| `PieLegend` | Slice labels with values or percentages | `{ slices, mode, format }` |

## Custom render (slots / render-props)

<!-- @fw:react -->
```tsx
// React — filter two of five series with your own layout
<Tooltip>
  {({ snapshots, time }) =>
    snapshots
      .filter((s) => s.seriesId === 'btc' || s.seriesId === 'eth')
      .map((s) => (
        <div key={s.id} style={{ color: s.color }}>
          {s.label}: {s.data.close ?? s.data.value}
        </div>
      ))
  }
</Tooltip>
```
<!-- @/fw -->
<!-- @fw:vue -->
```vue
<!-- Vue — same context, different syntax -->
<Tooltip v-slot="{ snapshots, time }">
  <div
    v-for="s in snapshots.filter((x) => x.seriesId === 'btc' || x.seriesId === 'eth')"
    :key="s.id"
    :style="{ color: s.color }"
  >
    {{ s.label }}: {{ s.data.close ?? s.data.value }}
  </div>
</Tooltip>
```
<!-- @/fw -->
<!-- @fw:svelte -->
```svelte
<!-- Svelte — let:-bindings expose slot props -->
<Tooltip let:snapshots let:time>
  {#each snapshots.filter((s) => s.seriesId === 'btc' || s.seriesId === 'eth') as s (s.id)}
    <div style="color: {s.color}">{s.label}: {s.data.close ?? s.data.value}</div>
  {/each}
</Tooltip>
```
<!-- @/fw -->

Each overlay has its own slot context (see the Slot ctx column above); the shape is consistent across frameworks for the same overlay.

### Public helpers (re-exported from each framework package)

- `buildHoverSnapshots(chart, { time, sort?, cacheKey })` / `buildLastSnapshots(chart, { sort?, cacheKey })` — structural-equality-cached snapshot arrays for building your own floating widgets. Calls with the same args return the **same reference** while the chart's overlay version is unchanged, so `React.memo` / Vue `computed` / Svelte `$:` skip renders on no-op mousemoves.
- `computeTooltipPosition({ x, y, chartWidth, chartHeight, tooltipWidth, tooltipHeight, offsetX?, offsetY? })` — flip + clamp positioning for a tooltip container you own.
- Types: `SeriesSnapshot`, `LegendItem`, `SliceInfo`, `HoverInfo`.

## Custom number formatting

Every numeric overlay accepts a `format` prop so you can override the default label rendering. Two shared helpers ship in each framework package (`@wick-charts/react`, `@wick-charts/vue`, `@wick-charts/svelte`):

- `formatCompact(v)` — K/M/B/T suffixes with adaptive precision. Default for `YAxis` (at ranges ≥ 1e6), `PieLegend`, `PieTooltip`, `Sparkline`.
- `formatPriceAdaptive(v)` — full-precision display that scales decimals to the value's magnitude. Default for `Tooltip` / `InfoBar` OHLC and line-value cells. Handles sub-cent prices (`0.00001234` → `"0.00001234"`, not `"0.00"`).

<!-- @fw:react -->
```tsx
import { Tooltip, YAxis, formatCompact } from '@wick-charts/react';

<YAxis format={(v) => `$${formatCompact(v)}`} />
<Tooltip format={(v, field) => field === 'volume' ? formatCompact(v) : v.toFixed(4)} />
```
<!-- @/fw -->
<!-- @fw:vue -->
```vue
<script setup>
import { Tooltip, YAxis, formatCompact } from '@wick-charts/vue';

const yFormat = (v) => `$${formatCompact(v)}`;
const tipFormat = (v, field) => (field === 'volume' ? formatCompact(v) : v.toFixed(4));
</script>

<template>
  <YAxis :format="yFormat" />
  <Tooltip :format="tipFormat" />
</template>
```
<!-- @/fw -->
<!-- @fw:svelte -->
```svelte
<script>
  import { Tooltip, YAxis, formatCompact } from '@wick-charts/svelte';

  const yFormat = (v) => `$${formatCompact(v)}`;
  const tipFormat = (v, field) => (field === 'volume' ? formatCompact(v) : v.toFixed(4));
</script>

<YAxis format={yFormat} />
<Tooltip format={tipFormat} />
```
<!-- @/fw -->

Tooltip / InfoBar pass a `field` arg (`'open' | 'high' | 'low' | 'close' | 'volume' | 'value'`) so you can branch on which cell you're formatting. All other overlays receive a single `value: number`.

## Themes

22 built-in themes. Import only the ones you need (tree-shakable) and pass them to `ChartContainer` or `ThemeProvider` for global theming.

<!-- @fw:react -->
```tsx
import { catppuccin } from '@wick-charts/react';

// Dark: andromeda, ayuMirage, catppuccin, dracula, gruvbox, highContrast,
//       materialPalenight, monokaiPro, nightOwl, oneDarkPro, panda
// Light: githubLight, handwritten, lavenderMist, lightPink, minimalLight, mintBreeze,
//        peachCream, quietLight, rosePineDawn, sandDune, solarizedLight

<ChartContainer theme={catppuccin.theme}>
```
<!-- @/fw -->
<!-- @fw:vue -->
```vue
<script setup>
import { catppuccin } from '@wick-charts/vue';
// Dark: andromeda, ayuMirage, catppuccin, dracula, gruvbox, highContrast,
//       materialPalenight, monokaiPro, nightOwl, oneDarkPro, panda
// Light: githubLight, handwritten, lavenderMist, lightPink, minimalLight, mintBreeze,
//        peachCream, quietLight, rosePineDawn, sandDune, solarizedLight
</script>

<template>
  <ChartContainer :theme="catppuccin.theme" />
</template>
```
<!-- @/fw -->
<!-- @fw:svelte -->
```svelte
<script>
  import { catppuccin } from '@wick-charts/svelte';
  // Dark: andromeda, ayuMirage, catppuccin, dracula, gruvbox, highContrast,
  //       materialPalenight, monokaiPro, nightOwl, oneDarkPro, panda
  // Light: githubLight, handwritten, lavenderMist, lightPink, minimalLight, mintBreeze,
  //        peachCream, quietLight, rosePineDawn, sandDune, solarizedLight
</script>

<ChartContainer theme={catppuccin.theme} />
```
<!-- @/fw -->

Create custom themes with `createTheme()`:

<!-- @fw:react -->
```tsx
import { createTheme } from '@wick-charts/react';

const myTheme = createTheme({
  background: '#1a1b2e',
  upColor: '#00d4aa',
  downColor: '#ff5577',
  textColor: '#8888aa',
});
```
<!-- @/fw -->
<!-- @fw:vue -->
```ts
import { createTheme } from '@wick-charts/vue';

const myTheme = createTheme({
  background: '#1a1b2e',
  upColor: '#00d4aa',
  downColor: '#ff5577',
  textColor: '#8888aa',
});
```
<!-- @/fw -->
<!-- @fw:svelte -->
```ts
import { createTheme } from '@wick-charts/svelte';

const myTheme = createTheme({
  background: '#1a1b2e',
  upColor: '#00d4aa',
  downColor: '#ff5577',
  textColor: '#8888aa',
});
```
<!-- @/fw -->

## Real-Time Data

<!-- @fw:react -->
```tsx
// Full replace (initial load)
<CandlestickSeries data={allCandles} />

// The component auto-detects changes:
// - data.length grew by 1-5 → append
// - data.length same → update last point
// - data.length shrunk or grew by >5 → full replace
```
<!-- @/fw -->
<!-- @fw:vue -->
```vue
<template>
  <!-- Full replace (initial load) -->
  <CandlestickSeries :data="allCandles" />
</template>

<!--
  The component auto-detects changes:
  - data.length grew by 1-5 → append
  - data.length same → update last point
  - data.length shrunk or grew by >5 → full replace
-->
```
<!-- @/fw -->
<!-- @fw:svelte -->
```svelte
<!-- Full replace (initial load) -->
<CandlestickSeries data={allCandles} />

<!--
  The component auto-detects changes:
  - data.length grew by 1-5 → append
  - data.length same → update last point
  - data.length shrunk or grew by >5 → full replace
-->
```
<!-- @/fw -->

<!-- @only:react -->
## Batch Updates

```tsx
const chart = useChartInstance();

chart.batch(() => {
  chart.setSeriesData(id, layer0, 0);
  chart.setSeriesData(id, layer1, 1);
  // Y-range and render happen once after batch
});
```
<!-- @/only -->

## Configuration

<!-- @fw:react -->
```tsx
<ChartContainer
  theme={theme}
  axis={{
    y: { visible: true, width: 55, min: 0, max: 'auto' },
    x: { visible: true, height: 30 },
  }}
  padding={{ top: 20, bottom: 20, right: { intervals: 3 }, left: { intervals: 0 } }}
  gradient={true}
  interactive={true}
  grid={true}
>
```
<!-- @/fw -->
<!-- @fw:vue -->
```vue
<template>
  <ChartContainer
    :theme="theme"
    :axis="{
      y: { visible: true, width: 55, min: 0, max: 'auto' },
      x: { visible: true, height: 30 },
    }"
  />
</template>

<!-- Vue ChartContainer currently accepts theme + axis; padding/gradient/grid/interactive are React-only. -->
```
<!-- @/fw -->
<!-- @fw:svelte -->
```svelte
<ChartContainer
  {theme}
  axis={{
    y: { visible: true, width: 55, min: 0, max: 'auto' },
    x: { visible: true, height: 30 },
  }}
/>

<!-- Svelte ChartContainer currently accepts theme + axis (+ style); padding/gradient/grid/interactive are React-only. -->
```
<!-- @/fw -->

<!-- @only:react -->
## Hooks

| Hook | Description |
|---|---|
| `useChartInstance()` | Access the `ChartInstance` from context |
| `useVisibleRange(chart)` | Current visible time range |
| `useYRange(chart)` | Current Y-axis min/max |
| `useLastYValue(chart, id)` | Last value + live status for a series |
| `usePreviousClose(chart, id)` | Previous close price |
| `useCrosshairPosition(chart)` | Crosshair coordinates and snapped time |
<!-- @/only -->

## Bundle Size

Full `dist/index.js` (minified + gzipped):

| Package | Raw | Gzip |
|---|---|---|
<!-- @only:react -->
| `@wick-charts/react`  | 224 KB | 59.3 KB |
<!-- @/only -->
<!-- @only:vue -->
| `@wick-charts/vue`    | 219 KB | 57.3 KB |
<!-- @/only -->
<!-- @only:svelte -->
| `@wick-charts/svelte` | 293 KB | 69.9 KB |
<!-- @/only -->

<!-- @only:react -->
Tree-shaking on the consumer side cuts this down further — `pnpm size` builds representative React scenarios through esbuild with production settings:

| Scenario | Raw | Gzip |
|---|---|---|
| Candlestick only | 122.1 KB | 36.3 KB |
| Line only | 122.4 KB | 36.4 KB |
| Full React (all overlays) | 140.6 KB | 41.3 KB |
<!-- @/only -->

## Migration

Upgrading across versions? See [MIGRATION.md](./MIGRATION.md) for per-version breaking-change notes and code snippets.

## License

MIT
