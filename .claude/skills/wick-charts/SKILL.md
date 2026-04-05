---
name: wick-charts
description: Build charts with Wick Charts library. Use when creating candlestick, line, bar, or pie charts in React, Vue, or Svelte.
---

# Wick Charts

Canvas-based charting library with integrations for React, Vue 3, and Svelte.

## Packages

- `@wick-charts/core` — Framework-agnostic chart engine
- `@wick-charts/react` — React components and hooks
- `@wick-charts/vue` — Vue 3 components and composables
- `@wick-charts/svelte` — Svelte components and stores

All framework packages re-export types and themes from core. Install only the one you need.

## Chart types

- **Candlestick** — OHLCV financial data
- **Line / Area** — Multi-layer, stacking, area fill, pulse animation
- **Bar / Histogram** — Multi-layer, stacking (off / normal / percent)
- **Pie / Donut** — `innerRadiusRatio > 0` for donut

## Data types

```ts
// Candlestick — time is Unix timestamp in SECONDS
interface OHLCData { time: number; open: number; high: number; low: number; close: number; volume?: number }

// Line and Bar
interface LineData { time: number; value: number }

// Pie
interface PieSliceData { label: string; value: number; color?: string }
```

## Series options

### CandlestickSeriesOptions
```ts
{
  label?: string;
  upColor: string;
  downColor: string;
  wickUpColor: string;
  wickDownColor: string;
  bodyWidthRatio: number; // 0-1
}
```

### LineSeriesOptions
```ts
{
  label?: string;
  colors: string[];       // one color per layer
  lineWidth: number;
  areaFill: boolean;      // gradient area fill below line
  pulse: boolean;         // animated pulsing dot at last point
  stacking: 'off' | 'normal' | 'percent';
}
```

### BarSeriesOptions
```ts
{
  colors: string[];
  barWidthRatio: number;
  stacking: 'off' | 'normal' | 'percent';
}
```

### PieSeriesOptions
```ts
{
  colors?: string[];          // palette fallback (defaults to theme.seriesColors)
  innerRadiusRatio: number;   // 0 = pie, >0 = donut
  padAngle: number;           // gap in radians (default 0.02)
  strokeColor: string;
  strokeWidth: number;
  label?: string;
}
```

## Axis configuration

```ts
interface AxisConfig {
  y?: { width?: number; min?: AxisBound; max?: AxisBound; visible?: boolean }
  x?: { height?: number; visible?: boolean }
}
// AxisBound: 'auto' | number | "+10%" | ((values: number[]) => number)
```

## UI overlay components

All frameworks have the same overlay components:

| Component | Props | Description |
|-----------|-------|-------------|
| `Tooltip` | `seriesId?`, `sort?: 'none'\|'asc'\|'desc'`, `legend?: boolean` | Compact legend + floating tooltip |
| `Crosshair` | none | Price and time labels at cursor |
| `YAxis` | none | Animated Y axis |
| `TimeAxis` | none | Animated time axis (alias: `XAxis`) |
| `YLabel` | `seriesId`, `color?` | Horizontal dashed line + price badge |
| `Legend` | `items?`, `position?: 'bottom'\|'right'`, `mode?: 'toggle'\|'solo'` | Interactive legend (rendered outside chart) |
| `PieLegend` | `seriesId`, `format?: 'value'\|'percent'` | Pie chart legend |
| `PieTooltip` | `seriesId` | Hover tooltip for pie slices |
| `NumberFlow` | `value`, `format?`, `spinDuration?` | Animated number display |

## Themes

### Built-in themes (20+)

**Dark:** `darkTheme`, `dracula`, `oneDarkPro`, `monokaiPro`, `nightOwl`, `materialPalenight`, `gruvbox`, `catppuccin`, `ayuMirage`, `panda`, `andromeda`, `highContrast`, `handwritten`

**Light:** `lightTheme`, `githubLight`, `solarizedLight`, `rosePineDawn`, `quietLight`, `lavenderMist`, `mintBreeze`, `sandDune`, `peachCream`, `minimalLight`, `lightPink`

### Custom theme

```ts
import { createTheme } from '@wick-charts/react'; // or /vue or /svelte

// Only background is required — everything else is auto-derived
const custom = createTheme({
  background: '#0f172a',
  candlestick: { upColor: '#10b981', downColor: '#ef4444' },
  seriesColors: ['#3b82f6', '#8b5cf6', '#ec4899'],
});

// Or build by name
import { buildTheme } from '@wick-charts/react';
const theme = buildTheme('Dracula');
```

## Framework-specific guides

See the framework-specific reference files for component APIs, hooks/composables/stores, and usage examples:

- [React](react.md) — Components, hooks, ThemeProvider
- [Vue](vue.md) — Components, composables, provide/inject
- [Svelte](svelte.md) — Components, stores, context
