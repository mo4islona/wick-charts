---
name: wick-charts
description: Build charts with the Wick Charts library. Use when creating candlestick, line, area, bar, band (range), order book, pie or sparkline charts, or streaming live data into a chart, in React, Vue or Svelte.
---

# Wick Charts

Canvas-based charting library for React, Vue 3, and Svelte.

## Packages

- `@wick-charts/react` — components + hooks + `ThemeProvider`
- `@wick-charts/vue` — components + composables
- `@wick-charts/svelte` — components + stores
- `@wick-charts/nuxt` — Nuxt module that auto-imports the `@wick-charts/vue` components and composables (see [Nuxt](#nuxt))

Core components (`ChartContainer`, all `*Series`, `Tooltip`, `InfoBar`, `Title`, `Crosshair`, axes, `YLabel`, `Legend`, `Marker`, `ReferenceLine`, `TimeRegion`, `PieTooltip`, `PieLegend`) exist in every framework with matching semantics — syntax differs only where the host framework forces it (`:prop` / `{prop}`).

Framework-specific gaps to know about:

- **React only**: `ThemeProvider`, `Sparkline` and `EdgeLoader`.
- `ChartContainer` takes the same props in all three frameworks. React adds `style` / `className`; Vue passes `style` / `class` through to the root element; Svelte takes `style` as a string.
- The [reactive accessors](#reactive-accessors) are hooks in React, composables with the same names in Vue, and stores in Svelte.
- **Svelte**: the components work in Svelte 4 and Svelte 5. In a Svelte 5 project (`sv create` turns runes on), write your own components with runes — `let { data }: { data: OHLCInput[] } = $props()`, not `export let` — and keep chart data in `$state.raw` (see [Realtime updates](#realtime-updates)).

## shadcn/ui, shadcn-vue and shadcn-svelte

In a shadcn/ui project (React), a shadcn-vue project (Vue, Nuxt) or a shadcn-svelte project (Svelte 5), install from the Wick Charts registry instead of wiring a theme by hand. Items install as source files into the project. The three registries have the same items:

- `wick-theme` — `useWickTheme(ref?)` builds a `ChartTheme` from the shadcn CSS variables (`--background`, `--foreground`, `--muted-foreground`, `--border`, `--chart-1` … `--chart-5`) and follows light/dark switches. React: `@/hooks/use-wick-theme`. Vue: `@/composables/useWickTheme`, takes a template ref. Svelte: `$lib/hooks/wick-theme.svelte`, takes a getter for a `bind:this` element and returns `{ current }`.
- `wick-chart` — `<WickChart>`: `ChartContainer` themed by that hook, sized with classes (`aspect-video` by default), horizontal grid lines only. `theme` takes a `ChartTheme` or a function that adjusts the generated one. Import it from `@/components/ui/wick-chart` (Svelte: `$lib/components/ui/wick-chart/index.js`).
- Blocks in a shadcn `Card`: `chart-line-live`, `chart-candlestick`, `chart-order-book`, `chart-sparkline-cards`, `chart-bar-grouped`, `chart-pie-donut`, `chart-band-latency`, `chart-area-stacked`, `chart-heatmap`, `chart-line-annotations`, `chart-line-navigator`. A Vue block is `@/components/ChartCandlestick.vue` (PascalCase), a Svelte block `$lib/components/chart-candlestick.svelte` (default export).

| | React (shadcn/ui) | Vue / Nuxt (shadcn-vue) | Svelte (shadcn-svelte) |
|---|---|---|---|
| CLI | `npx shadcn@latest add` | `npx shadcn-vue@latest add` | `npx shadcn-svelte@latest add` |
| Registry | `https://wick-charts.eeff.io/r/{name}.json` | `https://wick-charts.eeff.io/r/vue/{name}.json` | `https://wick-charts.eeff.io/r/svelte/{name}.json` |
| Index | `https://wick-charts.eeff.io/r/registry.json` | `https://wick-charts.eeff.io/r/vue/registry.json` | `https://wick-charts.eeff.io/r/svelte/index.json` |

```bash
# React: the shadcn CLI resolves @wick-charts without config
npx shadcn@latest add @wick-charts/wick-chart @wick-charts/chart-candlestick
# Vue / Nuxt
npx shadcn-vue@latest add https://wick-charts.eeff.io/r/vue/wick-chart.json
# Svelte
npx shadcn-svelte@latest add https://wick-charts.eeff.io/r/svelte/wick-chart.json
# shadcn-vue: or add "@wick-charts": "<registry URL above>" under "registries" in components.json and add by name.
```

```tsx
import { LineSeries, TimeAxis, type TimePoint, Tooltip, YAxis } from '@wick-charts/react';

import { WickChart } from '@/components/ui/wick-chart';

export function Revenue({ data }: { data: TimePoint[] }) {
  return (
    <WickChart className="aspect-auto h-[250px]">
      <LineSeries data={data} />
      <YAxis />
      <TimeAxis />
      <Tooltip />
    </WickChart>
  );
}
```

```vue
<script setup lang="ts">
import { LineSeries, TimeAxis, type TimePoint, Tooltip, YAxis } from '@wick-charts/vue';

import { WickChart } from '@/components/ui/wick-chart';

defineProps<{ data: TimePoint[] }>();
</script>

<template>
  <WickChart class="aspect-auto h-[250px]">
    <LineSeries :data="data" />
    <YAxis />
    <TimeAxis />
    <Tooltip />
  </WickChart>
</template>
```

```svelte
<script lang="ts">
  import { LineSeries, TimeAxis, type TimePoint, Tooltip, YAxis } from '@wick-charts/svelte';

  import { WickChart } from '$lib/components/ui/wick-chart/index.js';

  let { data }: { data: TimePoint[] } = $props();
</script>

<WickChart class="aspect-auto h-[250px]">
  <LineSeries {data} />
  <YAxis />
  <TimeAxis />
  <Tooltip />
</WickChart>
```

## Nuxt

`@wick-charts/nuxt` registers every `@wick-charts/vue` component with a `Wick` prefix and auto-imports the composables, so a page needs no imports. Import types, themes, helpers and `useTheme` from `@wick-charts/vue`.

```bash
npx nuxi module add @wick-charts/nuxt
```

```vue
<script setup lang="ts">
import type { OHLCData } from '@wick-charts/vue';

// A server route that returns [{ time, open, high, low, close }], time in ms.
const { data: candles } = await useFetch<OHLCData[]>('/api/candles');
</script>

<template>
  <div style="height: 400px">
    <WickChartContainer>
      <WickCandlestickSeries :data="candles ?? []" />
      <WickCrosshair />
      <WickTooltip />
      <WickYAxis />
      <WickTimeAxis />
    </WickChartContainer>
  </div>
</template>
```

- No `<ClientOnly>`: the server renders the sized, themed container, and the canvas draws after hydration.
- `useFetch` on the server puts every row into the HTML payload. For thousands of rows, pass `{ server: false }`.
- Options: `wickCharts: { prefix: 'Wick', composables: true }` in `nuxt.config.ts`. A prefix applies to every name (`prefix: 'Chart'` gives `<ChartChartContainer>`). Do not set an empty prefix: `<Title>` is then Nuxt's head component, and the app's own components can take other names. The module warns at build time when that happens.
- The shadcn-vue registry works in Nuxt too: see [shadcn/ui and shadcn-vue](#shadcnui-and-shadcn-vue).

## Chart types (reference pages)

- [Candlestick](candlestick.md) — OHLCV with volume bars
- [Line / Area](line.md) — multi-layer, stacking, area, pulse
- [Bar / Histogram](bar.md) — multi-layer, stacking, grouped category bars, value labels
- [Band / Range](#band-series) — fill between a `low` and a `high` edge; percentile bands, Bollinger, fan charts (section below)
- [Order book](#depth-series) — cumulative bid / ask walls around mid on a numeric price axis (section below)
- [Pie / Donut](pie.md) — `innerRadiusRatio`, hover animation, "Other" grouping (on by default)
- [Sparkline](sparkline.md) — inline mini-chart + value label (React only)

## ChartContainer

Root component. Requires a defined width + height.

```tsx
<ChartContainer
  theme={catppuccin.theme}
  axis={{ y: { min: 0, max: 'auto' }, x: { visible: true } }}
  padding={{ top: 20, bottom: 20, right: { intervals: 3 }, left: { intervals: 0.5 } }}
  viewport={{ maxVisibleBars: 200, initialRange: 35 }}
  gradient grid={{ visible: true }} interactive
  headerLayout="overlay"
  style={{ width: '100%', height: 400 }}
>
  {/* series + overlays */}
</ChartContainer>
```

Props: `theme`, `axis`, `scales`, `padding`, `viewport`, `gradient`, `grid`, `interactive`, `headerLayout`, `animations`, `onEdgeReached`, `perf`, `style`, `className` — all optional with safe defaults, in parity across React/Vue/Svelte (`style` / `className` are React props; Vue passes `style` / `class` through; Svelte `style` is a string). `padding.top|bottom` are pixels; `padding.left|right` accept pixels **or** `{ intervals: N }` for N empty data slots. `grid` is `{ visible?, horizontal?, vertical? }` (all default `true`) — `grid={{ visible: false }}` hides it, `grid={{ vertical: false }}` keeps only the horizontal lines. `axis.y` / `axis.x` accept `width` / `height` respectively for axis gutter sizing; `axis.y.position` is `'right'` (default) or `'left'` — the plot area shifts past a left axis, and every overlay (YAxis, TimeAxis, YLabel, Crosshair, Tooltip, Navigator) plus the default edge fade follow it. Custom overlays should size themselves to `chart.getLayout().chartArea` (or offset scale output by `chart.plotLeft`) instead of assuming the axis is on the right. A custom overlay that sits on an axis (a price pill, a badge) can call `const cover = chart.coverAxisLabels(el)`: the tick labels under it hide while it shows — call `cover.update()` after it moves and `cover.remove()` on unmount (`<Crosshair>` and `<YLabel>` do this already). `axis.y.scale` takes a value mapping — omit it for linear, `logScale()` (import it; `logScale({ base: 2 })` for powers-of-two ticks) for a log axis, or any `{ forward, inverse, isPlottable?, ticks?, format? }` object (define it outside the component so it stays the same object). Autoscale and Y animations run in the scale's space; values it can't place (≤ 0 on log) are skipped — a gap in a line, no bar or candle — and a percent-stacked series throws when the scale can't place 0. `headerLayout` is `'overlay' | 'inline'` — defaults to `'overlay'` (Title / InfoBar float above the canvas with their height folded into `padding.top`); `'inline'` pushes them into the vertical flow instead. `viewport.maxVisibleBars` (default 200) caps the visible window before tail-scroll kicks in. `viewport.initialRange` matches `chart.setVisibleRange(spec)` (bar count, `{from, to}`, or `{from, bars}`) and is applied **before** the first paint — use instead of an after-mount `useEffect(() => chart.setVisibleRange(...))` to avoid a visible re-zoom on the next frame. `animations` is configured at construction time and is **init-only** — there is no `chart.setAnimations` runtime setter; remount the chart (or change the React `key`) to swap curves or durations.

`AxisBound` = `'auto' | number | "+10%" | ((values: number[]) => number)`.

### Performance HUD

`perf={perfHud()}` (Vue `:perf="hud"` with `const hud = perfHud()`) puts an FPS panel on the chart; a click expands it to frame times, draw calls and the render time of each series. `perf` is read at mount only. Importing `perfHud` is what adds the perf code to the bundle — without it, a chart carries none. For the numbers without the panel, pass a `PerfMonitor` (`new PerfMonitor()`) and subscribe with `monitor.onFrame((stats) => …)`; several charts can share one monitor, and `perfHud(monitor)` shows the panel for a shared one.

## Animations

`<ChartContainer animations={…}>` accepts a single `AnimationsConfig` object with three top-level groups:

```ts
import { hermite, spring, snap } from '@wick-charts/react';

<ChartContainer
  animations={{
    axis: {
      y: { curve: hermite(), settle: 250, sticky: 2500, gesture: 100 },
      x: { curve: spring(), settle: 200, gesture: 150 },
      ticks: 250,
    },
    series: {
      line:        { entry: 250, smooth: 250, pulse: 600 },
      candlestick: { entry: 250, smooth: 250 },
      bar:         { entry: 250, smooth: 250 },
      band:        { entry: 250, smooth: 250 },
      pie:         { entry: 250, update: 250 },
      depth:       { intro: 500, update: 500 },
    },
    toggle: 250,
  }}
/>
```

| Group | Field | Default | Notes |
|---|---|---|---|
| `axis.y.curve` | `hermite()` / `spring()` / `snap()` | `hermite()` | Hermite = fixed-duration cubic. Spring = critically-damped physics. Snap = no easing. |
| `axis.y.settle` | ms | `250` | Outward chase to a new extreme. Lower = punchier reaction to spikes. |
| `axis.y.sticky` | ms | `2500` | Inward contraction after an extreme leaves the window. Sticky-Y feel. |
| `axis.y.gesture` | ms | `100` | One-shot override during pan/zoom — short = frame-per-tick interactive feel. |
| `axis.x.curve` | `spring()` / `snap()` | `spring()` | Spring carries velocity across streaming ticks. |
| `axis.x.settle` | ms | `200` | Streaming retarget baseline. The cadence EMA tunes this at runtime. |
| `axis.x.gesture` | ms | `150` | Pan/zoom commit easing. `0` = instant apply. |
| `axis.ticks` | ms | `250` | Cross-fade duration for axis tick labels. |
| `series.<kind>.entry` | ms | `250` (`linePulse: 600`) | Per-point/candle/bar/slice entrance duration. `false` disables. |
| `series.<kind>.smooth` | ms | `250` | Last-value chase on `updateData` ticks. `false` snaps. |
| `series.line.pulse` | ms | `600` | Halo cycle period at the line tail (periodic loop). `false` disables. |
| `series.pie.update` | ms | `250` | Slice-resize duration on data change. |
| `series.depth.intro` | ms | `500` | Depth walls grow out from mid on the first data; the full reveal lasts ~2×. |
| `series.depth.update` | ms | `500` | Depth morph to each new book, mid-marker glide and hover-highlight ease. |
| `toggle` | ms | `250` | Series-visibility fade + Y re-fit duration. |

**Disabling a whole group.** Any group field accepts `false` to skip animations for that subtree — `animations: false` (chart-wide), `animations: { axis: false }`, `animations: { series: { line: false } }`, etc.

**Per-series-type entry style.** Each series option also accepts `entryAnimation` for the visual *style* (separate from duration). Defaults: line `'grow'`, band `'grow'`, bar `'fade-grow'`, candlestick `'unfold'`. See each chart-type page for the full enum.

**Curve factories.** `hermite()`, `spring()`, `snap()` are factories — call them when assigning. Reuse the same factory instance across renders (memoize in `useMemo` / `computed`) so the engine doesn't see a fresh reference on every re-render.

## UI overlay components

Placed as children of `ChartContainer`.

| Component | Props | Slot ctx | Notes |
|---|---|---|---|
| `Title` | `children`, `sub?` | — | Title bar, hoisted above canvas |
| `InfoBar` | `sort?`, `format?` | `{ snapshots, time, isHover }` | OHLC / values info bar, hoisted above canvas |
| `Tooltip` | `sort?`, `format?` | `{ snapshots, time }` | Floating glass tooltip near cursor (hover only) |
| `Legend` | `items?`, `position?: 'bottom'\|'right'`, `mode?: 'toggle'\|'isolate'` | `{ items: LegendItem[] }` | Series legend, hoisted below / beside canvas |
| `Crosshair` | — | — | Axis labels at cursor |
| `YAxis` | `format?`, `labelCount?`, `minLabelSpacing?`, `scale?` | — | Vertical tick axis — of a named scale with `scale` |
| `XAxis` (alias `TimeAxis`) | `format?: (x, step) => string`, `labelCount?`, `minLabelSpacing?` | — | Horizontal axis of any `axis.x.type`; `format` also drives the crosshair label and tooltip / info-bar headers |
| `YLabel` | `seriesId?`, `color?`, `format?`, `scale?` | `{ value, y, bgColor, isLive, direction, format }` | Floating price badge + dashed line |
| `Marker` | `time`, `value?`, `seriesId?`, `shape?`, `pulse?`, `label?`, `color?`, `scale?` | — | Point annotation (event marker); **not a series** — excluded from tooltip / legend / Y-range |
| `ReferenceLine` | `value?` \| `time?`, `color?`, `label?`, `style?`, `width?`, `scale?` | — | Horizontal threshold (`value`) / vertical event line (`time`); above series; **not a series** |
| `TimeRegion` | `from`, `to?`, `fill?`, `label?`, `color?` | — | Shaded time-interval band (anomaly / maintenance window), behind series; **not a series** |
| `PieTooltip` | `seriesId?`, `format?` | `{ info, format }` | Pie hover tooltip |
| `PieLegend` | `seriesId?`, `mode?: 'value'\|'percent'`, `format?: (v) => string` | `{ slices, mode, format }` | Pie slice list (function formatter only) |
| `NumberFlow` | `value`, `format?`, `spinDuration?`, `shrinkDelay?` | — | Standalone animated number |

`seriesId` is optional on `YLabel` / `PieTooltip` / `PieLegend` — omit it on single-series charts and the first compatible visible series is picked automatically (time-series for `YLabel` — bands are skipped, a range has no single value; pie for `PieTooltip` / `PieLegend`). `InfoBar` and `Tooltip` are **always multi-series**; there is no `seriesId` prop. Filter inside the slot if you need a subset.

**Number formatting**: every overlay that displays a number accepts a `format` prop. On `Tooltip` / `InfoBar` the signature is `(value, field) => string` with `field ∈ {'open','high','low','close','volume','value'}`; elsewhere it's `(value) => string`. Shared helpers, exported from every framework package:

- `formatSignificant(v, { digits?, collapseZeros?, compactFrom?, trimZeros? })` keeps the digits that carry the value: `0.00000812` → `0.0₅812`, `1234567890` → `1.235B`, `5.4e15` → `5.4×10¹⁵`, and `68,432.17` in between. The `NumberFlow` default.
- `collapseZeros(text)` collapses the leading zeros of any formatted string: `0.000008123` → `0.0₅8123`.
- `formatTooltipValue` is the `Tooltip` / `InfoBar` default: compact volume, prices with fixed digits so a live row keeps its width. A series whose values are all whole numbers prints them without decimals (`237`, not `237.00`).
- `formatCompact` (K/M/B/T) and `formatPriceAdaptive` (full precision).

Y-axis ticks, the `YLabel` badge, the crosshair label, `Tooltip` and `InfoBar` collapse leading zeros by default, so a low-priced token (`0.0000081`) needs no custom `format`. The output stays a plain string with Unicode subscript / superscript digits; the built-in overlays draw those digits at a smaller size.

**Hoisting**: `Title` + `InfoBar` render as absolute overlays stacked at the top of the canvas block — the canvas (and the background grid) spans the full container height behind them, while their measured height is folded into `padding.top` so series data stays below. Floating `Tooltip` stacks *above* Title / InfoBar so it reads clearly when the cursor hovers near the header. `Legend` sits as a flex sibling below (or beside, with `position="right"`). Clicking an item toggles its series/layer visibility (`mode="toggle"` adds to a hidden set; `mode="isolate"` isolates that item and a second click restores all).

`Tooltip` is **floating-only**. For the top info bar, use `<InfoBar>` — the two are complementary and usually composed together.

## Markers (event annotations)

`<Marker>` pins a point annotation to a `time` + `value` — "anomaly opened here", "deploy shipped", "alert resolved". Unlike a series, a marker is **excluded from the tooltip, legend, and Y-range autoscale** and never shows up in series queries — so you don't need the single-point fake-series workaround. It draws on the overlay layer, clipped to the plot area, and can reuse the line pulse halo.

```tsx
<ChartContainer theme={theme}>
  <LineSeries id="metric" data={metric} />
  {/* explicit Y */}
  <Marker time={deployMs} value={observed} shape="dot" label="deploy v1.2.3" />
  {/* or snap Y to a series' value at `time` */}
  <Marker time={openedMs} seriesId="metric" shape="arrow-down" pulse label="broke" color="#f0556a" />
</ChartContainer>
```

- `time` — ms or `Date`.
- `value` — Y as a data value. **Omit it and pass `seriesId`** to snap Y to that series' nearest point at `time` (removes the "what Y do I use" problem).
- `shape` — `'dot' | 'circle' | 'arrow-up' | 'arrow-down'` (default `'dot'`). On a bare marker, arrows point their tip at the anchor.
- `pulse` — reuse the line halo animation (default `false`).
- `label` — optional text, drawn as a callout chip whose tail points at the anchor. The tail replaces an arrow glyph — a labeled arrow shape only picks the callout's side (above for `arrow-down`, below for `arrow-up`, auto-flips at plot edges) — while `dot` / `circle` keep their glyph under the callout.
- `color` — override; falls back to the series color (when `seriesId` is set), then the theme line color.

Render as many `<Marker>`s as you need. Prop set is identical across React / Vue / Svelte (parity-checked). Imperative core equivalents: `chart.addMarker(config) → id`, `chart.updateMarker(id, config)`, `chart.removeMarker(id)`.

## Time regions & reference lines (annotations)

Two more annotations in the same family as `<Marker>` — also **excluded from the tooltip, legend, and Y-range autoscale**.

`<TimeRegion>` shades a time interval with a translucent band (an anomaly window, a maintenance window, a highlighted session). It draws on the main layer **behind** the series, so data reads on top of the shading. Omit `to` (or pass `'now'`) for an open-ended band that extends to the right edge — the "still firing" case.

`<ReferenceLine>` is a straight line across the plot — a horizontal threshold / baseline pinned to a `value`, **or** a vertical event boundary pinned to a `time` (mutually exclusive). It draws on the overlay layer **above** the series, so a threshold reads on top of the data. `style` is `'solid' | 'dashed'` (default `'dashed'`).

```tsx
<ChartContainer theme={theme}>
  <LineSeries id="metric" data={metric} />
  {/* shade the incident; `to="now"` while still firing, a timestamp once recovered */}
  <TimeRegion from={brokeMs} to={recoveredMs ?? 'now'} fill="rgba(240,85,106,0.1)" color="#f0556a" label="incident" />
  {/* horizontal threshold + baseline */}
  <ReferenceLine value={70} label="alert 70" color="#f0a83c" />
  <ReferenceLine value={baseline} label="baseline" />
  {/* vertical event boundary */}
  <ReferenceLine time={deployMs} label="deploy v2.1.0" color="#6f9ef8" />
</ChartContainer>
```

- `TimeRegion`: `from` (ms / `Date`), `to?` (ms / `Date` / `'now'` / omitted → open-ended), `fill?` (default: faint tint of `color`), `color?` (edge + label accent, default muted axis color), `label?`.
- `ReferenceLine`: `value?` **xor** `time?` (a `time` wins if both are set), `color?` (default theme line color), `label?`, `style?`, `width?` (CSS px, default 1).

Prop sets are identical across React / Vue / Svelte (parity-checked). Imperative core equivalents: `chart.addRegion(config) → id` / `updateRegion` / `removeRegion`, and `chart.addLine(config) → id` / `updateLine` / `removeLine`.

## Themes

Dark: `catppuccin` (default), `dracula`, `oneDarkPro`, `monokaiPro`, `nightOwl`, `materialPalenight`, `gruvbox`, `ayuMirage`, `panda`, `andromeda`, `highContrast`, `handwritten`.

Light: `githubLight`, `solarizedLight`, `rosePineDawn`, `quietLight`, `lavenderMist`, `mintBreeze`, `sandDune`, `peachCream`, `minimalLight`, `lightPink`.

Each theme is a named export (tree-shakable). Custom:

```ts
import { createTheme, dracula } from '@wick-charts/react';

const custom = createTheme({
  background: '#0f172a', // only required field; rest auto-derived
  candlestick: {
    up: { body: '#10b981' }, // or `body: autoGradient('#10b981')` for a subtle vertical lift
    down: { body: '#ef4444' },
  },
  seriesColors: ['#3b82f6', '#8b5cf6', '#ec4899'],
});
const preset = dracula; // { name, theme, dark, fontUrl: string | null, backgroundImage?, backgroundSize? }

// createTheme returns a preset too: pass its `.theme`, e.g. <ChartContainer theme={custom.theme}>
```

`theme.tooltip.valueColor` (optional) paints tooltip values in one color instead of each series color — set it when a series color is too faint to read on the tooltip background; the swatch keeps the series color.

React also has `<ThemeProvider value={theme}>` for global theming.

## Reactive accessors

Same concepts across frameworks (React hooks → Vue composables → Svelte stores):

- `useChartInstance()` / `getChartContext()` — the `ChartInstance`
- `useVisibleRange(chart)` / `createVisibleRange(chart)` — `{ from, to }`
- `useYRange(chart)` / `createYRange(chart)` — `{ min, max }`
- `useLastYValue(chart, seriesId)` / `createLastYValue(chart, seriesId)` — `{ value, isLive } | null`
- `usePreviousClose(chart, seriesId)` / `createPreviousClose(chart, seriesId)` — `number | null`
- `useCrosshairPosition(chart)` / `createCrosshairPosition(chart)` — `{ mediaX, mediaY, time, y } | null`
- `useTheme()` / `getThemeContext()` — `ChartTheme`

React returns plain values, Vue returns refs, Svelte returns `Readable<T>` stores — read them with `$store`. Svelte's `getChartContext()` is a `Readable<ChartInstance | null>`; children of `ChartContainer` render only once the chart exists, so read it with `get()`:

```svelte
<script lang="ts">
  import { createLastYValue, getChartContext } from '@wick-charts/svelte';
  import { get } from 'svelte/store';

  let { seriesId }: { seriesId: string } = $props();

  const chart = get(getChartContext());
  const last = $derived(chart ? createLastYValue(chart, seriesId) : null);
</script>

{#if $last}
  <span>{$last.value.toFixed(2)}</span>
{/if}
```

## Multi-series overlay

Pass a stable `id` prop to the series. Reuse it on overlays that target a *specific* series (`YLabel`, `PieTooltip`, `PieLegend`) when you have multiple. `InfoBar` and `Tooltip` render every visible series automatically — no prop.

```tsx
const candleId = 'btc-ohlc';

<ChartContainer theme={catppuccin.theme}>
  <Title sub="BTC · 1h">BTC/USD</Title>
  <InfoBar />
  <CandlestickSeries id={candleId} data={ohlc} />
  <LineSeries data={{ label: 'SMA 20', color: '#ffd700', data: sma }} options={{ strokeWidth: 1 }} />
  <Tooltip />
  <Crosshair />
  <YAxis />
  <TimeAxis />
  <YLabel seriesId={candleId} />
</ChartContainer>
```

## Secondary Y scales

Two unrelated measures on one pane (price + RSI, rate + error rate): name a scale in `scales` on `ChartContainer` and put a series on it with `scale`. Each scale autoscales from its own visible series and animates like the default one; the time axis is shared.

```tsx
const SCALES = { rsi: { position: 'left', min: 0, max: 100 } }; // stable object — a new one refits

<ChartContainer scales={SCALES}>
  <LineSeries id="price" data={price} />
  <LineSeries id="rsi" scale="rsi" data={rsi} />
  <ReferenceLine value={70} scale="rsi" label="overbought" />
  <YAxis />
  <YAxis scale="rsi" format={(v) => v.toFixed(0)} />
  <YLabel seriesId="rsi" />
  <Crosshair />
  <TimeAxis />
</ChartContainer>
```

- A scale takes the `axis.y` fields: `position` (default: the side opposite the default axis), `visible` (`false` = overlay scale, autoscaled with no column), `width` (55), `min` / `max`, `scale` (e.g. `logScale()`). Live.
- `scale` works on `LineSeries`, `BarSeries`, `CandlestickSeries`, `BandSeries` (live). Without it — or with an id `scales` doesn't define (dev warning) — the series uses the default scale.
- One visible column per side: a second scale claiming a taken side renders as an overlay (dev warning). Grid lines follow the default scale.
- `<YAxis scale>` renders that scale's column; its `format` also drives that side's `<Crosshair>` label and the `YLabel` badge on that scale. `YLabel`, `ReferenceLine` and `Marker` take `scale`; `YLabel` defaults to its series' scale and sits on that scale's side. Tooltip rows show each series' own values.
- Core: `chart.setScales(scales)`, `chart.getYScale(id)`, `chart.getYScaleColumn(id)`, `chart.getSeriesScale(seriesId)`, `chart.getAxisColumnWidth(side)`, `chart.getAxisColumnScale(side)`, `chart.setYAxisFormat({ format, scale })`.

## Numeric and category X axes

`axis.x.type` picks what the X axis maps: `'time'` (default), `'numeric'` or `'category'`. Points then carry `x` in place of `time` — line / bar `{ x, value }`, band `{ x, low, high }` (`XPointInput` / `XBandPointInput`).

```tsx
// numeric: a curve over plain numbers, irregular spacing is fine
<ChartContainer axis={{ x: { type: 'numeric' } }}>
  <LineSeries data={[{ x: 1, value: 120 }, { x: 16, value: 840 }, { x: 64, value: 1020 }]} />
  <XAxis format={(x) => `${x} conn`} />
  <YAxis />
  <Crosshair />
  <Tooltip />
</ChartContainer>

// category: one band per name, bars fill their band
<ChartContainer axis={{ x: { type: 'category', padding: { inner: 0.3, outer: 0.2 } } }}>
  <BarSeries data={[{ x: 'EU', value: 42 }, { x: 'Asia', value: 35 }]} />
  <XAxis />
  <YAxis />
</ChartContainer>
```

- `type` is read at construction; a later change is ignored with a dev warning — remount (a React `key`) to switch.
- **Numeric**: linear mapping, 1-2-5 ticks (`labelCount` / `minLabelSpacing` on `<XAxis>`), locale-number labels, pan / zoom like time. The median point spacing sizes bar slots and the hover snap.
- **Category**: categories come from the data in first-seen order (series in mount order, points in data order) and follow every data change; a category no series holds disappears (its bars fade out at their band first). `axis.x.categories: string[]` fixes the order: listed names take the first bands, an empty band for a name without data, the rest follow in first-seen order (live). Band `i` is centred on coordinate `i`; `axis.x.padding` = `{ inner, outer }` in fractions of a step (default 0.3 / 0.2). Bars fill the band (`barWidthRatio` is ignored) — the layers of one multi-layer `BarSeries` stand side by side in it with `stacking: 'off'` (see [bar.md](bar.md#category-bars)) — lines and bands run through band centres, long labels end in an ellipsis, the viewport fits every band. Hover shades the hovered band behind bar series (`theme.bar.hoverBackground`).
- `axis.x.panZoom` (default `true`, `false` on category) turns drag / wheel off; the crosshair still works. Live.
- `CrosshairPosition.x` / `PointClickInfo.x` hold the domain value (epoch ms / number / category name); `time` is the internal coordinate (the band index on a category axis). Stored points keep their `x`.
- Line, bar and band work on every type; candlestick is time-only and depth numeric-only — `addSeries` throws for a series whose definition doesn't list the axis type (`SeriesDefinition.xTypes`, default `['time']`). Navigator, EdgeLoader / `onEdgeReached` and TimeRegion are time-only: disabled with a dev warning.
- A point whose `x` doesn't fit (a string on numeric, a non-string on category) is skipped with a dev warning.

## Band series

`<BandSeries>` fills the region between a `low` and a `high` edge over time — percentile bands (p5–p95), min/max envelopes, Bollinger bands, forecast intervals. Unlike a `LineSeries` area, the fill never closes to the plot floor.

```tsx
<ChartContainer theme={theme}>
  {/* declare the band first so the line draws over it */}
  <BandSeries data={rows.map((r) => ({ time: r.time, low: r.p5, high: r.p95 }))} />
  <LineSeries data={median} options={{ area: { visible: false } }} />
</ChartContainer>
```

Several bands in one series make a fan chart — layers draw in order with translucent fills:

```tsx
<BandSeries
  data={[
    { label: 'p5–p95', color: '#6f9ef8', data: outer },
    { label: 'p25–p75', color: '#6f9ef8', data: inner },
  ]}
/>
```

- **Data** (`BandData`) — the same omnivorous shapes as `LineSeries`, with `BandPointInput` = `{ time: number | Date; low: number; high: number }`: a flat array (one band), `BandPointInput[][]`, or named `{ label?, color?, data }` layers. A `low` above `high` draws with the edges swapped; a missing or non-finite edge is a gap that splits the band.
- **Colors** — one band defaults to `theme.bands.upper`, several to `theme.seriesColors`; a layer `color` overrides. Default fill = a vertical gradient of the layer color, 40% opacity at the top to 4% at the bottom; edges = layer color at 60%, 1px. `fill` takes a flat color or a `[top, bottom]` pair.
- **Options** — `fill` (a color, or `[top, bottom]` for a vertical gradient), `stroke: { visible, width, color }`, `curve: 'straight' | 'smooth' | 'stepped'` (`'smooth'` is monotone, never overshoots), `entryAnimation` / `entryMs`, `introAnimation` / `introMs`, `historyReveal` / `historyRevealMs`, `smoothMs`. `introAnimation` takes a `LineIntroFn` — the same `unfoldIntro()` (default), `sweepIntro()`, … as `LineSeries`. **No stacking.**
- **Overlays** — `Tooltip` / `InfoBar` show `low – high` (the snapshot `data` is a `BandPoint`); the crosshair marks both edges; the Y range covers both edges. `YLabel` skips bands.
- **Streaming** — same as a line: `appendData`, `updateData` (both edges chase smoothly), `prependData`, `keepLast`.

## Depth series

`<DepthSeries>` plots an order book: cumulative bid size stepping down to the best bid on the left of mid, cumulative ask size stepping up from the best ask on the right, with a dashed mid line and a `mid · spread` label. It needs a numeric X axis — on a time or category axis `addSeries` throws.

```tsx
<ChartContainer axis={{ x: { type: 'numeric' }, y: { min: 0 } }}>
  <DepthSeries bids={book.bids} asks={book.asks} options={{ span: 0.01 }} />
  <XAxis />
  <YAxis />
  <Crosshair />
  <Tooltip />
  <Legend />
</ChartContainer>
```

- **Data** — `bids` / `asks` are `DepthLevel[]` = `[price, size]` tuples in any order; the series sorts them and computes the cumulative depth. A level with size ≤ 0 is skipped; a repeated price keeps the last size.
- **Live updates** — pass new `bids` / `asks` arrays (a full snapshot morphs from the book on screen; 10+ per second is fine). Imperative: `chart.setSeriesData(id, { bids, asks })`, or `chart.updateData(id, { bids?, asks? })` to merge level deltas — a size of `0` removes that level.
- **View** — centered on mid: half-width `span × mid`, or without `span` the book fit (mid out to the nearer of the two outermost levels). The view eases to each new mid; wheel / pinch zoom around mid (double-click resets); drag-pan is off. Y runs from 0 to the deepest visible cumulative size.
- **Options** — `span`, `bidColor` / `askColor` (default: the theme's candlestick up / down colors), `strokeWidth` (1), `introMs`, `updateMs`.
- **Overlays** — `Tooltip` / `InfoBar` rows: `Bids` / `Asks` (the layers; `Legend` toggles them), the level price in the header, the cumulative size as the value. The hover dot snaps to the step's level and the area from mid to the pointer brightens. `InfoBar` in last-mode shows the best bid and ask.

## Custom render (slots / render-props)

Every overlay accepts a slot that replaces its *contents* with your own DOM. Positioning, crosshair wiring, and data computation stay in the library — you get the already-computed snapshots / items / info.

React uses a function-child render-prop; Vue uses a default scoped slot; Svelte uses a slot with `let:` destructuring. The context object is identical across frameworks (see the "Slot ctx" column in the overlay table above).

```tsx
// React — filter two of five series and pick your own layout
<Tooltip>
  {({ snapshots, time }) => (
    <div>
      <small>{new Date(time).toLocaleTimeString()}</small>
      {snapshots
        .filter((s) => s.seriesId === 'btc' || s.seriesId === 'eth')
        .map((s) => (
          <div key={s.id} style={{ color: s.color }}>
            {s.label}: {s.data.close ?? s.data.value}
          </div>
        ))}
    </div>
  )}
</Tooltip>
```

```vue
<!-- Vue — same context, different syntax -->
<Tooltip v-slot="{ snapshots, time }">
  <div>
    <small>{{ new Date(time).toLocaleTimeString() }}</small>
    <div v-for="s in snapshots.filter((x) => x.seriesId === 'btc' || x.seriesId === 'eth')" :key="s.id" :style="{ color: s.color }">
      {{ s.label }}: {{ s.data.close ?? s.data.value }}
    </div>
  </div>
</Tooltip>
```

```svelte
<!-- Svelte — let:-bindings expose slot props -->
<Tooltip let:snapshots let:time>
  <small>{new Date(time).toLocaleTimeString()}</small>
  {#each snapshots.filter((s) => s.seriesId === 'btc' || s.seriesId === 'eth') as s (s.id)}
    <div style="color: {s.color}">{s.label}: {s.data.close ?? s.data.value}</div>
  {/each}
</Tooltip>
```

### Snapshot shape (`InfoBar` / `Tooltip` slot)

```ts
interface SeriesSnapshot {
  readonly id: string;          // unique row key (safe for React key / v-for / #each key)
  readonly seriesId: string;    // owning series id (NOT unique when layered)
  readonly layerIndex?: number; // only set on multi-layer rows
  readonly label?: string;
  readonly color: string;
  readonly data: OHLCData | TimePoint | BandPoint; // deep-frozen clone — safe to read, mutation throws; BandPoint = { time, low, high }
}
```

`InfoBar` additionally exposes `isHover` — `true` while the cursor is on the chart, `false` in last-mode. `Tooltip` is hover-only and renders `null` when no crosshair is active.

### `Legend` slot items

`{ items: LegendItem[] }` — each item carries `{ id, seriesId, layerIndex?, label, color, isDisabled, toggle(), isolate() }`. The `toggle` / `isolate` closures are bound to that specific item, so you can sort / filter / reorder the array in your renderer without breaking visibility wiring.

### `YLabel` / `PieLegend` / `PieTooltip` slots

- `YLabel` — `{ value, y, bgColor, isLive, direction: 'up' | 'down' | 'neutral', format }`. Position yourself using `y` (pixel Y of the badge anchor).
- `PieLegend` — `{ slices: readonly SliceInfo[], mode: 'value' | 'percent', format }`.
- `PieTooltip` — `{ info: HoverInfo, format }`. Positioning (flip / clamp) stays in the library.

### Performance

- `buildHoverSnapshots` / `buildLastSnapshots` return the **same reference** while `chart.getOverlayVersion()` is unchanged. `React.memo((a, b) => a.snapshots === b.snapshots)` / Vue `computed` / Svelte `$:` skip renders on crosshair moves that stay within one data point.
- Slot context does **not** include `crosshair.mediaX/Y` (those change every mousemove). Call `useCrosshairPosition(chart)` / `createCrosshairPosition(chart)` yourself if you need pixel coordinates.
- When you render your own floating container instead of using `Tooltip` / `PieTooltip`, use `computeTooltipPosition({ x, y, chartWidth, chartHeight, tooltipWidth, tooltipHeight, offsetX?, offsetY? })` from `@wick-charts/react | vue | svelte` for flip + clamp behavior.

## Migration

Per-version breaking-change notes and code snippets live in the root [MIGRATION.md](../../../MIGRATION.md). Headline for 0.1 → 0.2: `seriesId` removed from `InfoBar` / `Tooltip` (filter in the slot instead); optional on `YLabel` / `PieTooltip` / `PieLegend` (auto-picks first visible compatible series).

## Realtime updates

Pass a new `data` array reference when data changes (e.g. via immutable state updates in React — the series components compare references in hook deps, so mutating in place won't re-render). The library diffs internally: same-length → updates last, +1..5 → incremental append, otherwise → full replace.

**Vue.** On a `ref` / `reactive` array the series also picks up an in-place `push` and an in-place edit of the last point; an in-place edit of an older point is not seen — pass a new array for that. Hold large datasets in a `shallowRef` and assign a new array: a deep `ref` makes Vue proxy every point your own code touches. `triggerRef` after an in-place `push` on a `shallowRef` does **not** reach the chart.

```ts
import { shallowRef } from 'vue';
import type { TimePoint } from '@wick-charts/vue';

const data = shallowRef<TimePoint[]>([]);

function onTick(point: TimePoint) {
  data.value = [...data.value, point]; // not data.value.push(point) + triggerRef(data)
}
```

**Svelte 5.** Keep chart data in `$state.raw` (or a store) and assign a new array. A deep `$state` hands the chart a proxy, and reading every point through it is about 70× slower on large data: 130k candles block the main thread for ~2 s instead of ~30 ms, and order-book updates take 20–30 ms instead of 1–3 ms. A `$state.raw` array changed in place is not seen at all.

```svelte
<script lang="ts">
  import { ChartContainer, LineSeries, type TimePoint } from '@wick-charts/svelte';

  let data = $state.raw<TimePoint[]>([]);

  $effect(() => {
    const id = setInterval(() => {
      data = [...data, { time: Date.now(), value: Math.random() * 100 }].slice(-500);
    }, 1000);

    return () => clearInterval(id);
  });
</script>

<ChartContainer>
  <LineSeries {data} />
</ChartContainer>
```

**Svelte 4.** Assign a new array, or edit in place and then assign the same array (`data = data`).

## Critical rules

- `time` is milliseconds (`Date.now()`-style). `TimePointInput` / `OHLCInput` also accept `Date`. On a numeric or category X axis (`axis.x.type`) points carry `x` instead.
- `TimePoint` is the canonical point shape (used by `LineSeries`, `BarSeries`, `Sparkline`).
- `LineSeries` / `BarSeries` `data` (`MultiLayerData`) is omnivorous: a flat `TimePointInput[]`, layered `TimePointInput[][]`, a named `{ label, color?, data }` layer, or an array mixing raw and named layers.
- **There is no `label` or `colors` option on `LineSeries` / `BarSeries`** (candlestick keeps neither `colors` nor `label`) — a layer's name *and* color ride in `data` (`{ label?, color?, data }`). Multi-layer lines/bars auto-name unnamed layers `Series N` (the per-layer name the tooltip *and* legend show — they now agree).
- **Color comes from the theme + per-layer `data.color` override.** `color` is a `ValueColor` = `string | ((value) => string)`. The function colors a **bar per bar** and a **line by its latest value**. Single bars default to `theme.bar.color` (green-up / red-down by sign); multi-layer uses `theme.seriesColors`.
- `CandlestickSeries` `data` is `OHLCInput[]` or `{ label, data }` (single stream; `color` not applicable).
- `BandSeries` `data` (`BandData`) takes the same omnivorous shapes as `LineSeries`, with `{ time, low, high }` points — one band per layer, no stacking.
- `PieSeries` `data` is flat `PieSliceData[]`.
- `DepthSeries` takes `bids` / `asks` (`[price, size][]`), not `data`, and needs `axis.x.type: 'numeric'`.
- `VisibleRange` is a deprecated alias for `XRange` (identical shape `{ from, to }`). Use `XRange` in new code.
