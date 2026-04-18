---
name: wick-charts
description: Build charts with Wick Charts library. Use when creating candlestick, line, bar, or pie charts in React, Vue, or Svelte.
---

# Wick Charts

Canvas-based charting library for React, Vue 3, and Svelte.

## Packages

- `@wick-charts/react` — components + hooks + `ThemeProvider`
- `@wick-charts/vue` — components + composables
- `@wick-charts/svelte` — components + stores

Core components (`ChartContainer`, all `*Series`, `Tooltip`, `TooltipLegend`, `Title`, `Crosshair`, axes, `YLabel`, `PieTooltip`, `PieLegend`) exist in every framework with matching semantics — syntax differs only where the host framework forces it (`:prop` / `{prop}`).

Framework-specific gaps to know about:

- **React** has the richest surface: `ThemeProvider`, `Legend`, `Sparkline`, and several hooks (`useChartInstance`, `useVisibleRange`, `useYRange`, `useLastYValue`, `usePreviousClose`, `useCrosshairPosition`, `useTheme`). `ChartContainer` accepts `padding`, `gradient`, `grid`, `interactive`, `style`, `className`.
- **Vue** and **Svelte** `ChartContainer` currently accept only `theme` + `axis` (+ `style` in Svelte); `padding`/`gradient`/`grid`/`interactive` props are React-only for now. `Legend` is not yet ported.

## Chart types (reference pages)

- [Candlestick](candlestick.md) — OHLCV with volume bars
- [Line / Area](line.md) — multi-layer, stacking, area, pulse
- [Bar / Histogram](bar.md) — multi-layer, stacking
- [Pie / Donut](pie.md) — `innerRadiusRatio`, hover animation
- [Sparkline](sparkline.md) — inline mini-chart + value label (React only)

## ChartContainer

Root component. Requires a defined width + height.

```tsx
<ChartContainer
  theme={darkTheme}
  axis={{ y: { min: 0, max: 'auto' }, x: { visible: true } }}
  padding={{ top: 20, bottom: 20, right: { intervals: 3 }, left: { intervals: 0 } }}
  gradient grid interactive
  style={{ width: '100%', height: 400 }}
>
  {/* series + overlays */}
</ChartContainer>
```

React props: `theme`, `axis`, `padding`, `gradient`, `grid`, `interactive`, `style`, `className` (all optional, safe defaults). `padding.top|bottom` are pixels; `padding.left|right` accept pixels **or** `{ intervals: N }` for N empty data slots.

Vue / Svelte props (current subset): `theme`, `axis` (+ `style` in Svelte). `padding`/`gradient`/`grid`/`interactive` are React-only at the moment — use the sensible defaults on Vue and Svelte, or size via the wrapping element.

`AxisBound` = `'auto' | number | "+10%" | ((values: number[]) => number)`.

## UI overlay components

Placed as children of `ChartContainer`.

| Component | Props | Notes |
|---|---|---|
| `Title` | `children`, `sub?` | Title bar, hoisted above canvas |
| `TooltipLegend` | `seriesId?`, `sort?` | OHLC / values info bar, hoisted above canvas |
| `Tooltip` | `seriesId?`, `sort?` | Floating glass tooltip near cursor (hover only) |
| `Legend` | `items?`, `position?: 'bottom'\|'right'`, `mode?: 'toggle'\|'solo'` | Series legend, hoisted below / beside canvas (**React only**) |
| `Crosshair` | — | Axis labels at cursor |
| `YAxis` / `TimeAxis` (alias `XAxis`) | — | Default axes |
| `YLabel` | `seriesId`, `color?` | Floating price badge + dashed line |
| `PieTooltip` / `PieLegend` | `seriesId` (+ `format?`) | Pie-only variants |
| `NumberFlow` | `value`, `format?`, `spinDuration?` | Standalone animated number |

**Hoisting**: `Title` + `TooltipLegend` render as absolute overlays stacked at the top of the canvas block — the canvas (and the background grid) spans the full container height behind them, while their measured height is folded into `padding.top` so series data stays below. Floating `Tooltip` stacks *above* Title / TooltipLegend so it reads clearly when the cursor hovers near the header. `Legend` (**React only**) sits as a flex sibling below (or beside, with `position="right"`).

`Tooltip` is **floating-only**. For the top info bar, use `<TooltipLegend>` — the two are complementary and usually composed together.

## Themes

Dark: `darkTheme`, `dracula`, `oneDarkPro`, `monokaiPro`, `nightOwl`, `materialPalenight`, `gruvbox`, `catppuccin`, `ayuMirage`, `panda`, `andromeda`, `highContrast`, `handwritten`.

Light: `lightTheme`, `githubLight`, `solarizedLight`, `rosePineDawn`, `quietLight`, `lavenderMist`, `mintBreeze`, `sandDune`, `peachCream`, `minimalLight`, `lightPink`.

Each theme is a named export (tree-shakable). Custom:

```ts
import { createTheme, dracula } from '@wick-charts/react';

const custom = createTheme({
  background: '#0f172a', // only required field; rest auto-derived
  candlestick: { upColor: '#10b981', downColor: '#ef4444' },
  seriesColors: ['#3b82f6', '#8b5cf6', '#ec4899'],
});
const preset = dracula; // { theme, dark, fontUrl?, backgroundImage? }
```

React also has `<ThemeProvider value={theme}>` for global theming.

## Reactive accessors

Same concepts across frameworks (React hooks → Vue composables → Svelte stores):

- `useChartInstance()` / `getChartContext()` — the `ChartInstance`
- `useVisibleRange(chart)` — `{ from, to }`
- `useYRange(chart)` — `{ min, max }`
- `useLastYValue(chart, seriesId)` — `{ value, isLive } | null`
- `usePreviousClose(chart, seriesId)` — `number | null`
- `useCrosshairPosition(chart)` — `{ mediaX, mediaY, time, y } | null`
- `useTheme()` / `getThemeContext()` — `ChartTheme`

React/Vue return plain values / refs; Svelte returns `Readable<T>` — read with `$store`.

## Multi-series overlay

```tsx
<ChartContainer theme={darkTheme}>
  <Title sub="BTC · 1h">BTC/USD</Title>
  <TooltipLegend seriesId={candleId} />
  <CandlestickSeries data={ohlc} onSeriesId={setCandleId} />
  <LineSeries data={[sma]} options={{ colors: ['#ffd700'], lineWidth: 1 }} label="SMA 20" />
  <Tooltip />
  <Crosshair />
  <YAxis />
  <TimeAxis />
  {candleId && <YLabel seriesId={candleId} />}
</ChartContainer>
```

## Realtime updates

Pass a new `data` array reference when data changes (e.g. via immutable state updates in React — the series components compare references in hook deps, so mutating in place won't re-render). The library diffs internally: same-length → updates last, +1..5 → incremental append, otherwise → full replace.

## Critical rules

- `time` is milliseconds (`Date.now()`-style). `TimePointInput` / `OHLCInput` also accept `Date`.
- `TimePoint` is canonical; `LineData` is a deprecated alias.
- `LineSeries` / `BarSeries` `data` is always `TimePoint[][]` — wrap single datasets as `[myData]`.
- `PieSeries` `data` is flat `PieSliceData[]`.
