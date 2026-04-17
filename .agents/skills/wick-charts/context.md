# Context & custom children

`<ChartContainer>` sets up two contexts on mount:

- **Chart context** — holds the `ChartInstance` (imperative API).
- **Theme context** — holds the current `ChartTheme`.

Any descendant component can read from these. That's how built-in overlays (`Tooltip`, `Crosshair`, `YAxis`, `Legend`, `YLabel`) work — and how you build your own.

## React

`useChartInstance()` returns `ChartInstance`, throws if used outside `<ChartContainer>`.
`useTheme()` returns `ChartTheme`, throws outside a `<ThemeProvider>` (which `ChartContainer` sets up internally).
`useThemeOptional()` returns `ChartTheme | null` — use when a component may render outside any provider.

```tsx
import { ChartContainer, CandlestickSeries, useChartInstance, useTheme, darkTheme } from '@wick-charts/react';

function FitButton() {
  const chart = useChartInstance();
  const theme = useTheme();
  return (
    <button onClick={() => chart.fitContent()} style={{ background: theme.background }}>
      Fit
    </button>
  );
}

<ChartContainer theme={darkTheme}>
  <CandlestickSeries data={ohlc} />
  <FitButton />
</ChartContainer>
```

### Sharing a theme across charts

`<ThemeProvider>` can wrap multiple containers:

```tsx
import { ThemeProvider, ChartContainer, catppuccin } from '@wick-charts/react';

<ThemeProvider value={catppuccin}>
  <ChartContainer>...</ChartContainer>
  <ChartContainer>...</ChartContainer>  {/* inherits catppuccin */}
</ThemeProvider>
```

A `ChartContainer` with its own `theme` prop overrides the provider.

## Vue

`useChartInstance()` returns the instance directly. `useTheme()` returns `ShallowRef<ChartTheme>` (reactive — unwrap with `.value` in script, auto-unwrap in template). Both throw outside `<ChartContainer>`.

```vue
<script setup lang="ts">
import { useChartInstance, useTheme } from '@wick-charts/vue';
const chart = useChartInstance();
const theme = useTheme();
</script>
<template>
  <button @click="chart.fitContent()" :style="{ background: theme.background }">Fit</button>
</template>
```

## Svelte

`getChartContext()` returns `Readable<ChartInstance | null>` — nullable because the instance is created on mount. `getThemeContext()` returns `Readable<ChartTheme>`. Access via `$store`.

```svelte
<script lang="ts">
  import { getChartContext, getThemeContext } from '@wick-charts/svelte';
  const chart = getChartContext();
  const theme = getThemeContext();
</script>
<button on:click={() => $chart?.fitContent()} style="background: {$theme.background}">Fit</button>
```

## Imperative `ChartInstance` methods

Useful from custom children:

- `fitContent()` — auto-fit viewport to all data across every series.
- `getVisibleRange()`, `getYRange()`, `getCrosshairPosition()` — one-shot reads.
- `getLastValue(id)` → `{ value, isLive } | null`, `getPreviousClose(id)` → `number | null`, `getLastData(id)`, `getDataAtTime(id, time)` — data queries.
- `setSeriesVisible(id, visible)`, `setLayerVisible(id, layer, visible)` — series toggling.
- `setTheme(theme)`, `setAxis(config)`, `setPadding(padding)`, `setGrid(on)` — post-mount configuration.
- `getSeriesIds()`, `getSeriesColor(id)`, `getSeriesLabel(id)`, `getSeriesLayers(id)` — introspection.

For **reactive** reads of common state, prefer the built-in hooks/composables/stores (`useVisibleRange`, `useYRange`, `useLastYValue`, `usePreviousClose`, `useCrosshairPosition` / Svelte `create*` equivalents) — they subscribe to the right chart events and update automatically.
