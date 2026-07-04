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

Core components (`ChartContainer`, all `*Series`, `Tooltip`, `InfoBar`, `Title`, `Crosshair`, axes, `YLabel`, `Legend`, `Marker`, `ReferenceLine`, `TimeRegion`, `PieTooltip`, `PieLegend`) exist in every framework with matching semantics — syntax differs only where the host framework forces it (`:prop` / `{prop}`).

Framework-specific gaps to know about:

- **React** has the richest surface: `ThemeProvider`, `Sparkline`, and several hooks (`useChartInstance`, `useVisibleRange`, `useYRange`, `useLastYValue`, `usePreviousClose`, `useCrosshairPosition`, `useTheme`). `ChartContainer` accepts `padding`, `gradient`, `grid`, `interactive`, `style`, `className`.
- **Vue** and **Svelte** `ChartContainer` currently accept only `theme` + `axis` (+ `style` in Svelte); `padding`/`gradient`/`grid`/`interactive` props are React-only for now.

## Chart types (reference pages)

- [Candlestick](candlestick.md) — OHLCV with volume bars
- [Line / Area](line.md) — multi-layer, stacking, area, pulse
- [Bar / Histogram](bar.md) — multi-layer, stacking
- [Pie / Donut](pie.md) — `innerRadiusRatio`, hover animation, "Other" grouping (on by default)
- [Sparkline](sparkline.md) — inline mini-chart + value label (React only)

## ChartContainer

Root component. Requires a defined width + height.

```tsx
<ChartContainer
  theme={catppuccin.theme}
  axis={{ y: { min: 0, max: 'auto' }, x: { visible: true } }}
  padding={{ top: 20, bottom: 20, right: { intervals: 3 }, left: { intervals: 0 } }}
  viewport={{ maxVisibleBars: 200, initialRange: 35 }}
  gradient grid={{ visible: true }} interactive
  headerLayout="overlay"
  style={{ width: '100%', height: 400 }}
>
  {/* series + overlays */}
</ChartContainer>
```

Props: `theme`, `axis`, `padding`, `viewport`, `gradient`, `grid`, `interactive`, `headerLayout`, `animations`, `onEdgeReached`, `perf`, `style`, `className` — all optional with safe defaults, in parity across React/Vue/Svelte (style is React/Svelte only). `padding.top|bottom` are pixels; `padding.left|right` accept pixels **or** `{ intervals: N }` for N empty data slots. `grid` is `{ visible: boolean }` — pass `grid={{ visible: false }}` to hide. `axis.y` / `axis.x` accept `width` / `height` respectively for axis gutter sizing. `headerLayout` is `'overlay' | 'inline'` — defaults to `'overlay'` (Title / InfoBar float above the canvas with their height folded into `padding.top`); `'inline'` pushes them into the vertical flow instead. `viewport.maxVisibleBars` (default 200) caps the visible window before tail-scroll kicks in. `viewport.initialRange` matches `chart.setVisibleRange(spec)` (bar count, `{from, to}`, or `{from, bars}`) and is applied **before** the first paint — use instead of an after-mount `useEffect(() => chart.setVisibleRange(...))` to avoid a visible re-zoom on the next frame. `animations` is configured at construction time and is **init-only** — there is no `chart.setAnimations` runtime setter; remount the chart (or change the React `key`) to swap curves or durations.

`AxisBound` = `'auto' | number | "+10%" | ((values: number[]) => number)`.

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
      pie:         { entry: 250, update: 250 },
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
| `toggle` | ms | `250` | Series-visibility fade + Y re-fit duration. |

**Disabling a whole group.** Any group field accepts `false` to skip animations for that subtree — `animations: false` (chart-wide), `animations: { axis: false }`, `animations: { series: { line: false } }`, etc.

**Per-series-type entry style.** Each series option also accepts `entryAnimation` for the visual *style* (separate from duration). Defaults: line `'grow'`, bar `'fade-grow'`, candlestick `'unfold'`. See each chart-type page for the full enum.

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
| `YAxis` | `format?` | — | Vertical tick axis |
| `TimeAxis` (alias `XAxis`) | — | — | Horizontal time axis |
| `YLabel` | `seriesId?`, `color?`, `format?` | `{ value, y, bgColor, isLive, direction, format }` | Floating price badge + dashed line |
| `Marker` | `time`, `value?`, `seriesId?`, `shape?`, `pulse?`, `label?`, `color?` | — | Point annotation (event marker); **not a series** — excluded from tooltip / legend / Y-range |
| `ReferenceLine` | `value?` \| `time?`, `color?`, `label?`, `style?`, `width?` | — | Horizontal threshold (`value`) / vertical event line (`time`); above series; **not a series** |
| `TimeRegion` | `from`, `to?`, `fill?`, `label?`, `color?` | — | Shaded time-interval band (anomaly / maintenance window), behind series; **not a series** |
| `PieTooltip` | `seriesId?`, `format?` | `{ info, format }` | Pie hover tooltip |
| `PieLegend` | `seriesId?`, `mode?: 'value'\|'percent'`, `format?: (v) => string` | `{ slices, mode, format }` | Pie slice list (function formatter only) |
| `NumberFlow` | `value`, `format?`, `spinDuration?` | — | Standalone animated number |

`seriesId` is optional on `YLabel` / `PieTooltip` / `PieLegend` — omit it on single-series charts and the first compatible visible series is picked automatically (time-series for `YLabel`, pie for `PieTooltip` / `PieLegend`). `InfoBar` and `Tooltip` are **always multi-series**; there is no `seriesId` prop. Filter inside the slot if you need a subset.

**Number formatting**: every overlay that displays a number accepts a `format` prop. On `Tooltip` / `InfoBar` the signature is `(value, field) => string` with `field ∈ {'open','high','low','close','volume','value'}`; elsewhere it's `(value) => string`. Two shared helpers — `formatCompact` (K/M/B/T) and `formatPriceAdaptive` (full precision, keeps sub-cent decimals) — are exported from every framework package and used as defaults.

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
  readonly data: OHLCData | TimePoint; // deep-frozen clone — safe to read, mutation throws
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

## Critical rules

- `time` is milliseconds (`Date.now()`-style). `TimePointInput` / `OHLCInput` also accept `Date`.
- `TimePoint` is the canonical point shape (used by `LineSeries`, `BarSeries`, `Sparkline`).
- `LineSeries` / `BarSeries` `data` (`MultiLayerData`) is omnivorous: a flat `TimePointInput[]`, layered `TimePointInput[][]`, a named `{ label, color?, data }` layer, or an array mixing raw and named layers.
- **There is no `label` or `colors` option on `LineSeries` / `BarSeries`** (candlestick keeps neither `colors` nor `label`) — a layer's name *and* color ride in `data` (`{ label?, color?, data }`). Multi-layer lines/bars auto-name unnamed layers `Series N` (the per-layer name the tooltip *and* legend show — they now agree).
- **Color comes from the theme + per-layer `data.color` override.** `color` is a `ValueColor` = `string | ((value) => string)`. The function colors a **bar per bar** and a **line by its latest value**. Single bars default to `theme.bar.color` (green-up / red-down by sign); multi-layer uses `theme.seriesColors`.
- `CandlestickSeries` `data` is `OHLCInput[]` or `{ label, data }` (single stream; `color` not applicable).
- `PieSeries` `data` is flat `PieSliceData[]`.
- `VisibleRange` is a deprecated alias for `XRange` (identical shape `{ from, to }`). Use `XRange` in new code.
