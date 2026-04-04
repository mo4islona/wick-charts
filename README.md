# Framework Integrations

WickChart provides self-contained packages for **React**, **Svelte**, and **Vue**. Install only the one you need — each package includes the core engine, types, and themes.

## Installation

```bash
# React
npm install @wick-charts/react

# Svelte
npm install @wick-charts/svelte

# Vue
npm install @wick-charts/vue
```

## Quick Start

### React

```tsx
import { ChartContainer, LineSeries, darkTheme, Tooltip } from '@wick-charts/react';

function App() {
  const data = [
    { time: 1700000000, value: 100 },
    { time: 1700003600, value: 105 },
  ];

  return (
    <div style={{ width: 800, height: 400 }}>
      <ChartContainer theme={darkTheme}>
        <LineSeries data={data} options={{ color: '#00d4aa', pulse: true }} />
        <Tooltip />
      </ChartContainer>
    </div>
  );
}
```

### Svelte

```svelte
<script>
  import { ChartContainer, LineSeries, Tooltip, darkTheme } from '@wick-charts/svelte';

  const data = [
    { time: 1700000000, value: 100 },
    { time: 1700003600, value: 105 },
  ];
</script>

<div style="width: 800px; height: 400px">
  <ChartContainer theme={darkTheme}>
    <LineSeries {data} options={{ color: '#00d4aa', pulse: true }} />
    <Tooltip />
  </ChartContainer>
</div>
```

### Vue

```vue
<script setup>
import { ChartContainer, LineSeries, Tooltip, darkTheme } from '@wick-charts/vue';

const data = [
  { time: 1700000000, value: 100 },
  { time: 1700003600, value: 105 },
];
</script>

<template>
  <div style="width: 800px; height: 400px">
    <ChartContainer :theme="darkTheme">
      <LineSeries :data="data" :options="{ color: '#00d4aa', pulse: true }" />
      <Tooltip />
    </ChartContainer>
  </div>
</template>
```

## Components

All packages provide the same set of components:

| Component | Description |
|---|---|
| `ChartContainer` | Root container. Creates chart instance, provides context, manages canvas. |
| `LineSeries` | Line/area chart series |
| `BarSeries` | Histogram/bar chart series |
| `CandlestickSeries` | OHLC candlestick series |
| `StackedBarSeries` | Multi-layer stacked bar series |
| `PieSeries` | Pie/donut chart series |

## Reactive State

| State | React | Svelte | Vue |
|---|---|---|---|
| Chart instance | `useChartInstance()` | `getChartContext()` | `useChartInstance()` |
| Visible range | `useVisibleRange(chart)` | `createVisibleRange(chart)` | `useVisibleRange(chart)` |
| Price range | `usePriceRange(chart)` | `createPriceRange(chart)` | `usePriceRange(chart)` |
| Last price | `useLastPrice(chart, id)` | `createLastPrice(chart, id)` | `useLastPrice(chart, id)` |
| Previous close | `usePreviousClose(chart, id)` | `createPreviousClose(chart, id)` | `usePreviousClose(chart, id)` |
| Crosshair | `useCrosshairPosition(chart)` | `createCrosshairPosition(chart)` | `useCrosshairPosition(chart)` |

## Themes

All themes are re-exported from each package:

```ts
import { darkTheme, lightTheme, catppuccin, dracula } from '@wick-charts/react';
// or '@wick-charts/svelte' or '@wick-charts/vue' — same exports
```

## Smart Data Diffing

All series components implement efficient data synchronization:

- **First load / data shrunk / large batch (>5 new points):** full replace
- **Same length:** updates last point in place (live ticks)
- **Small growth (1-5 points):** appends only new points

Pass the full data array each time — the component picks the optimal strategy.

## UI Overlays

All packages include the same set of pre-built overlay components:

| Component | Description |
|---|---|
| `Tooltip` | Compact legend (top-left) + floating tooltip near cursor with glass morphism |
| `Crosshair` | Price label (right axis) + time label (bottom axis) |
| `PriceLabel` | Horizontal dashed line + animated price badge at current price |
| `PriceAxis` | Y-axis with smooth tick fade-in/out animations |
| `TimeAxis` | X-axis with smooth tick fade-in/out animations |
| `PieTooltip` | Floating tooltip for pie/donut series showing label, value, and percentage |
| `NumberFlow` | Animated number display with digit spin transitions |

```tsx
// React
import { Tooltip, Crosshair, PriceAxis, TimeAxis } from '@wick-charts/react';
```

```svelte
<!-- Svelte -->
<script>
  import { Tooltip, Crosshair, PriceAxis, TimeAxis } from '@wick-charts/svelte';
</script>
```

```vue
<!-- Vue -->
<script setup>
import { Tooltip, Crosshair, PriceAxis, TimeAxis } from '@wick-charts/vue';
</script>
```

## Adding a New Series Type

1. Implement renderer in `packages/core/src/series/`
2. Add `addXxxSeries()` to `ChartInstance`
3. Add wrapper to each package:
   - `packages/react/src/XxxSeries.tsx`
   - `packages/svelte/src/XxxSeries.svelte`
   - `packages/vue/src/XxxSeries.vue`
4. Export from each package's `index.ts`

Use `LineSeries` as reference implementation.
