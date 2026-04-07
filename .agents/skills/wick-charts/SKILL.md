---
name: wick-charts
description: Build charts with Wick Charts library. Use when creating candlestick, line, bar, or pie charts in React, Vue, or Svelte.
---

# Wick Charts

Canvas-based charting library for React, Vue 3, and Svelte.

## Packages

Install only the one you need. Each re-exports all types and themes from core.

- `@wick-charts/react` — Components, hooks, ThemeProvider
- `@wick-charts/vue` — Components, composables, provide/inject
- `@wick-charts/svelte` — Components, stores, context

## Chart types

Each type has a dedicated reference page:

- [Candlestick](candlestick.md) — OHLCV financial data with volume bars
- [Line / Area](line.md) — Multi-layer, stacking, area fill, pulse animation
- [Bar / Histogram](bar.md) — Multi-layer, stacking (off / normal / percent)
- [Pie / Donut](pie.md) — Donut via `innerRadiusRatio`, hover animations

## ChartContainer

The root component. Must have a defined width and height.

### React

```tsx
import { ChartContainer, darkTheme } from '@wick-charts/react';

<ChartContainer
  theme={darkTheme}
  axis={{ y: { min: 0, max: 'auto' }, x: { visible: true } }}
  padding={{ top: 20, bottom: 20, right: { intervals: 3 } }}
  gradient={true}
  interactive={true}
  grid={true}
  style={{ width: '100%', height: 400 }}
  className="my-chart"
>
  {/* Series + overlays */}
</ChartContainer>
```

### Vue

```vue
<ChartContainer :theme="darkTheme" :axis="axis">
  <!-- Series + overlays -->
</ChartContainer>
```

### Svelte

```svelte
<ChartContainer theme={darkTheme} {axis} style="width:100%;height:400px">
  <!-- Series + overlays -->
</ChartContainer>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `theme` | `ChartTheme` | `darkTheme` | Visual theme |
| `axis` | `AxisConfig` | — | Axis visibility, bounds, sizing |
| `padding` | `PaddingConfig` | see below | Chart padding |
| `gradient` | `boolean` | `true` | Background gradient (React only) |
| `interactive` | `boolean` | `true` | Zoom/pan/crosshair (React only) |
| `grid` | `boolean` | `true` | Background grid (React only) |

### Padding

```ts
padding?: {
  top?: number;                          // pixels, default: 20
  bottom?: number;                       // pixels, default: 20
  right?: number | { intervals: number }; // default: { intervals: 3 }
  left?: number | { intervals: number };  // default: { intervals: 0 }
}
```

`{ intervals: N }` adds N empty data intervals of space. Applied on mount only.

### Axis configuration

```ts
interface AxisConfig {
  y?: { width?: number; min?: AxisBound; max?: AxisBound; visible?: boolean }
  x?: { height?: number; visible?: boolean }
}

// AxisBound: 'auto' | number | "+10%" | ((values: number[]) => number)
```

## UI overlay components

Placed as children inside `ChartContainer`. Same API across all frameworks.

| Component | Props | Use with |
|-----------|-------|----------|
| `Tooltip` | `seriesId?`, `sort?: 'none'\|'asc'\|'desc'`, `legend?: boolean` | All time-based charts |
| `Crosshair` | — | All time-based charts |
| `YAxis` | — | All time-based charts |
| `TimeAxis` | — (alias: `XAxis`) | All time-based charts |
| `YLabel` | `seriesId`, `color?` | Candlestick, Line, Bar |
| `Legend` | `items?`, `position?: 'bottom'\|'right'`, `mode?: 'toggle'\|'solo'` | Multi-layer Line, Bar |
| `PieLegend` | `seriesId`, `format?: 'value'\|'percent'` | Pie only |
| `PieTooltip` | `seriesId` | Pie only |
| `NumberFlow` | `value`, `format?`, `spinDuration?` | Standalone animated number |

`Legend` renders outside the chart canvas — the viewport adjusts automatically.

## Themes

### Built-in (20+)

**Dark:** `darkTheme`, `dracula`, `oneDarkPro`, `monokaiPro`, `nightOwl`, `materialPalenight`, `gruvbox`, `catppuccin`, `ayuMirage`, `panda`, `andromeda`, `highContrast`, `handwritten`

**Light:** `lightTheme`, `githubLight`, `solarizedLight`, `rosePineDawn`, `quietLight`, `lavenderMist`, `mintBreeze`, `sandDune`, `peachCream`, `minimalLight`, `lightPink`

### Custom theme

```ts
import { createTheme } from '@wick-charts/react'; // or /vue or /svelte

const custom = createTheme({
  background: '#0f172a',  // only required field — rest auto-derived
  candlestick: { upColor: '#10b981', downColor: '#ef4444' },
  seriesColors: ['#3b82f6', '#8b5cf6', '#ec4899'],
});

// Or by name
import { buildTheme } from '@wick-charts/react';
const theme = buildTheme('Dracula');
```

### ThemeProvider (React)

```tsx
<ThemeProvider value={catppuccin}>
  <ChartContainer>...</ChartContainer>
  <ChartContainer>...</ChartContainer>
</ThemeProvider>
```

## Hooks / Composables / Stores

### React hooks

```ts
import { useChartInstance, useVisibleRange, useYRange, useLastYValue, usePreviousClose, useCrosshairPosition, useTheme } from '@wick-charts/react';

const chart = useChartInstance();                    // ChartInstance
const range = useVisibleRange(chart);                // { from, to }
const yRange = useYRange(chart);                     // { min, max }
const last = useLastYValue(chart, seriesId);         // { value, isLive } | null
const prevClose = usePreviousClose(chart, seriesId); // number | null
const crosshair = useCrosshairPosition(chart);       // { mediaX, mediaY, time, y } | null
const theme = useTheme();                            // ChartTheme
```

### Vue composables

```ts
import { useChartInstance, useVisibleRange, useYRange, useLastYValue, usePreviousClose, useCrosshairPosition, useTheme } from '@wick-charts/vue';
// Same API — all return Ref<T>
```

### Svelte stores

```ts
import { getChartContext, getThemeContext, createVisibleRange, createYRange, createLastYValue, createPreviousClose, createCrosshairPosition } from '@wick-charts/svelte';

const chartStore = getChartContext();   // Readable<ChartInstance | null>
const themeStore = getThemeContext();    // Readable<ChartTheme>
// create* functions return Readable<T> — use $store syntax
```

## Multiple series overlay

Combine any time-based series in one `ChartContainer`:

```tsx
<ChartContainer theme={darkTheme}>
  <CandlestickSeries data={ohlcData} onSeriesId={setCandleId} />
  <LineSeries
    data={[smaData]}
    options={{ colors: ['#ffd700'], lineWidth: 1, areaFill: false, pulse: false }}
    label="SMA 20"
  />
  <Tooltip />
  <Crosshair />
  <YAxis />
  <TimeAxis />
  {candleId && <YLabel seriesId={candleId} />}
</ChartContainer>
```

## Real-time updates

Update the `data` prop — framework reactivity handles the rest. Smart diffing applies automatically:

- Same array length → updates last point only
- Grew by 1-5 items → appends incrementally
- Otherwise → full replace

## Critical rules

- **Time is in milliseconds** (`Date.now()` style) — or pass a `Date` object
- `OHLCData` / `TimePoint` have `time: number` (ms). Use `OHLCInput` / `TimePointInput` when passing `Date` objects
- `TimePoint` is the canonical type (`LineData` is a deprecated alias)
- Line and Bar `data` is always `TimePoint[][]` — wrap single datasets: `[myData]`
- Pie `data` is `PieSliceData[]` (not nested)
