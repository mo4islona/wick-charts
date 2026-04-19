# Wick Charts

High-performance timeseries charts for **React**, **Vue**, and **Svelte**. Canvas-rendered, tree-shakeable, ~25KB gzipped.

[Live Demo](https://mo4islona.github.io/wick-charts/)

## Features

- **Candlestick, Line, Bar, Pie** — all from one package
- **Real-time streaming** — append/update data at 60fps
- **25 built-in themes** — dark, light, and custom
- **Interactive** — zoom, pan, crosshair, tooltips
- **Stacking** — normal and percent modes for line/bar
- **Tree-shakeable** — import only what you use
- **Zero dependencies** — just your framework

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

## Series Types

| Component | Data Format | Description |
|---|---|---|
| `CandlestickSeries` | `{ time, open, high, low, close, volume? }[]` | OHLC candlesticks with volume bars |
| `LineSeries` | `{ time, value }[][]` | Line/area charts, multi-layer, stacking |
| `BarSeries` | `{ time, value }[][]` | Histogram/bar charts, stacking |
| `PieSeries` | `{ label, value, color? }[]` | Pie and donut charts |

## UI Overlays

| Component | Description |
|---|---|
| `Tooltip` | Floating glass tooltip near cursor on hover |
| `TooltipLegend` | Compact OHLC / values info bar hoisted above the canvas |
| `Title` | Chart title / subtitle bar hoisted above the canvas |
| `Crosshair` | Axis labels at cursor position |
| `YAxis` | Vertical price/value axis with animated ticks |
| `TimeAxis` | Horizontal time axis with animated ticks |
| `YLabel` | Floating price badge with dashed line |
| `Legend` | Clickable legend with toggle/solo modes |
| `PieTooltip` | Tooltip for pie/donut hover |

## Themes

22 built-in themes. Import only the ones you need (tree-shakable) and pass them to `ChartContainer` or `ThemeProvider` for global theming.

```tsx
import { catppuccin } from '@wick-charts/react';

// Dark: andromeda, ayuMirage, catppuccin, dracula, gruvbox, highContrast,
//       materialPalenight, monokaiPro, nightOwl, oneDarkPro, panda
// Light: githubLight, handwritten, lavenderMist, lightPink, minimalLight, mintBreeze,
//        peachCream, quietLight, rosePineDawn, sandDune, solarizedLight

<ChartContainer theme={catppuccin.theme}>
```

Create custom themes with `createTheme()`:

```tsx
import { createTheme } from '@wick-charts/react';

const myTheme = createTheme({
  background: '#1a1b2e',
  upColor: '#00d4aa',
  downColor: '#ff5577',
  textColor: '#8888aa',
});
```

## Real-Time Data

```tsx
// Full replace (initial load)
<CandlestickSeries data={allCandles} />

// The component auto-detects changes:
// - data.length grew by 1-5 → append
// - data.length same → update last point
// - data.length shrunk or grew by >5 → full replace
```

## Batch Updates

```tsx
const chart = useChartInstance();

chart.batch(() => {
  chart.setSeriesData(id, layer0, 0);
  chart.setSeriesData(id, layer1, 1);
  // Y-range and render happen once after batch
});
```

## Configuration

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

## Hooks

| Hook | Description |
|---|---|
| `useChartInstance()` | Access the `ChartInstance` from context |
| `useVisibleRange(chart)` | Current visible time range |
| `useYRange(chart)` | Current Y-axis min/max |
| `useLastYValue(chart, id)` | Last value + live status for a series |
| `usePreviousClose(chart, id)` | Previous close price |
| `useCrosshairPosition(chart)` | Crosshair coordinates and snapped time |

## Bundle Size

| Package | Gzip | Brotli |
|---|---|---|
| `@wick-charts/react` | 29 KB | 25 KB |
| `@wick-charts/vue` | 28 KB | 24 KB |
| `@wick-charts/svelte` | 35 KB | 30 KB |

Tree-shaking reduces this further — a candlestick-only chart is ~20 KB gzip.

## License

MIT
