# Migration guide

## 0.5 → 0.6

Version 0.6 is almost entirely additive — the heatmap series, intro
animations, per-point line markers, declarative event props, the open series
contract, and the testing subpath all land without touching existing
signatures. There are two API breaks (a `Sparkline` prop rename and a widened
`SeriesKind` type) and a set of changed defaults: charts now play an intro
animation on first load, the Y-label badge glides, pie corners round, and
`<ChartContainer>` floors its height.

### Breaking: `Sparkline` `formatValue` → `format`

The prop is renamed and typed as the shared `ValueFormatter` instead of an
inline function type, matching `format` on `YLabel` / `Tooltip`. No
back-compat alias. (`Sparkline` is React-only, so Vue / Svelte are
unaffected.)

```tsx
// 0.5
<Sparkline data={data} formatValue={(v) => v.toFixed(2)} />

// 0.6
<Sparkline data={data} format={(v) => v.toFixed(2)} />
```

### Breaking: `SeriesKind` is open-ended

`SeriesKind` was the closed union `'candlestick' | 'line' | 'bar' | 'pie'`.
It now includes `'heatmap'` and any custom string — 0.6 opens the series
renderer contract, so a custom series picks its own kind:

```ts
// 0.5
type SeriesKind = 'candlestick' | 'line' | 'bar' | 'pie';

// 0.6
type SeriesKind = 'candlestick' | 'line' | 'bar' | 'pie' | 'heatmap' | (string & {});
```

Two consequences for consumer code:

- An exhaustive `switch` over `SeriesKind` no longer type-checks without a
  `default` branch.
- Code that separated "pie vs time series" by testing `kind !== 'pie'` now
  misclassifies heatmaps (and future spatial kinds). Use the new
  `isTimeSeriesRenderer` guard, exported from every framework package.

### Behavior: series play an intro animation on first load

Each series type reveals its initial data seed with an intro — the line
draws itself into shape, bars grow from the baseline, candles unfold in a
left-to-right wave, and the pie sweeps its slices clockwise (in 0.5 the
`series.pie.entry` config was parsed but never wired; it now actually runs).
Intros play once per seed: bulk re-seeds of a non-empty series never replay
them, and `prefers-reduced-motion` skips them entirely.

Duration is a new `intro` knob in the animations config, or `introMs` on the
series options; `false` / `0` disables:

```tsx
// Chart-level
<ChartContainer animations={{ series: { line: { intro: false } } }}>

// Per-series
<LineSeries data={data} options={{ introMs: false }} />

// Everything off, as before
<ChartContainer animations={false}>
```

The choreography itself is pluggable via `options.introAnimation` — a
per-frame function returning declarative directives. Shipped styles (all
exported from every framework package):

- **line** (`LineIntroFn`) — `unfoldIntro()` (default), `sweepIntro()`,
  `traceIntro()`, `plotterIntro()`, `centerOutIntro()`.
- **bar** (`BarIntroFn`) — `growIntro()` (default), `springIntro()`.
- **candlestick** (`CandleIntroFn`) — `candleUnfoldIntro()` (default),
  `wickBodyIntro()`.
- **bar + candlestick shared** (`WaveIntroFn`) — `riseIntro()`,
  `fadeIntro()`, `wipeIntro()`.

### Behavior: the Y-label badge glides and reveals with the intro

`YLabel` no longer teleports: a new point eases the badge to its Y and rolls
its digits, and during the initial-load reveal it counts up from the first
visible value, locked to the series draw front. Markers and reference lines
fade in as the same front sweeps past their X. Honors
`prefers-reduced-motion`.

The new `animate` prop controls it — `animate={false}` snaps at full opacity
with no animation, or tune the parts:

```tsx
<YLabel animate={false} />
<YLabel animate={{ glide: true, countUp: false }} />
```

### Behavior: annotation labels render as callout chips

Labeled markers, time regions, and reference lines drop the solid
accent-colored pills for a shared chip style: a translucent surface plate
with a hairline accent outline, label set in the theme ink. A labeled marker
becomes a callout — the chip centers over the anchor with a pointer tail
traced into the outline. Visual only, no API change; omit `label` for a bare
glyph.

### Behavior: pie slices round their corners

`cornerRadius` on the pie options rounds each slice's corners (outer rim,
plus the inner rim on donuts) and defaults to `3`, matching the bar and
candlestick families. Pass `cornerRadius: 0` for the 0.5 sharp wedges. Pies
also stopped collapsing on small canvases — the radius is floored and the
disk recentered, and outside labels truncate / auto-hide instead of
squeezing the pie to a dot.

### Behavior: `<ChartContainer>` floors its height at 240px

A chart in an unsized parent used to collapse to 0px and render nothing.
`ChartContainer`'s wrapper now carries `min-height: 240px`, so the Quick
Start snippet works without an explicit height. For an intentionally shorter
chart, release the floor:

```tsx
<div style={{ height: 96 }}>
  <ChartContainer style={{ minHeight: 0 }}>…</ChartContainer>
</div>
```

(`Sparkline` does this internally — in 0.5.x its canvas silently inflated to
the floor and clipped.)

### Behavior: double-click fits the viewport

Double-clicking the plot area now restores `fitContent()` (dead code in 0.5
— it did nothing) and emits the new `pointDoubleClick` event. A double-click
no longer also fires a duplicate point click.

### Behavior (Vue): charts are interactive by default

Vue's boolean-prop casting turned an absent `interactive` prop into `false`,
so every Vue chart without an explicit `:interactive="true"` silently had no
pan / zoom / crosshair. Fixed — Vue now matches React and Svelte. If a chart
relied on being inert, pass `:interactive="false"` explicitly.

### Behavior: dev-only warnings on misbehaving data feeds

Two silent input repairs now warn once per instance in development builds:
unsorted timestamps handed to `setData` (they were silently re-sorted every
call), and an `append()` whose time isn't strictly after the last point (it
silently overwrote the last point instead of appending — the classic "my
streamed chart never grows" bug). Production builds stay silent.

### New in 0.6 — no migration needed

- **Heatmap series** — `<HeatmapSeries>` + `<HeatmapTooltip>` in all three
  wrappers: `(x, y)` category cells on a sequential ramp interpolated in
  OKLab, derived from the theme accent or pinned via the new
  `theme.heatmap.colors` token. Tweens configured under
  `animations.series.heatmap.{entry,update}`.
- **Per-point line markers** — `options.points: { visible, radius?, color? }`
  on the line series; dots ride the intro, live smoothing, and NaN gaps, and
  auto-hide at high densities.
- **Declarative chart wiring** — `ChartContainer` gains `onReady`,
  `onVisibleRangeChange`, `onCrosshairMove`, `onPointClick`,
  `onPointDoubleClick`, `onSeriesHover`, and a controlled `visibleRange`
  prop (safe to feed from `onVisibleRangeChange` — two-way binding, no
  feedback loop). Every series component gains `visible`; `<Legend>` gains
  `onToggle`.
- **Pointer events** — `pointClick` / `pointDoubleClick` (spatial hit-test
  included) and `seriesHover` on `ChartInstance`, with touch taps
  synthesized and drags suppressed.
- **Time locale / format** — `locale` and `timeZone` on the chart options,
  `chart.setLocale` / `chart.setTimeZone` on the instance (reachable from
  `onReady` in the wrappers), `XScale.setFormat` / `setLocale` / `setTimeZone`
  (symmetric with `YScale`), and a custom tick-generator hook on both scales.
- **Open series contract** — `SeriesRenderer`, `TimeSeriesRenderer`,
  `BaseSeriesRenderer`, `SeriesRenderContext`, `XScale` / `YScale` types are
  public; `chart.addSeries` accepts a custom definition with its own kind.
- **Pluggable `EdgeLoader` indicator** — `indicator` prop
  (`'canvas' | 'custom' | LoadingIndicatorFn`) on the React-only
  `EdgeLoader`, and `chart.setEdgeIndicator(side, fn)` in every framework;
  ships `skeletonLoadingIndicator`, a shimmer over placeholder candles sized
  from the live bar spacing.
- **Stable history prepend** — loading older points onto the front of a
  series (the `EdgeLoader` flow) no longer snaps the viewport and Y range;
  the reconciler detects the prepend and routes it through the new
  `chart.prependData`.
- **Testing subpath** — `@wick-charts/react/testing` exports
  `installCanvasMock()`: a working 2D-context mock (draw calls recorded on
  `canvas.__spy`), `ResizeObserver`, and `matchMedia` stubs for jsdom /
  happy-dom suites. React-only for now.
- **Vanilla entry point** — documented pattern: `import { ChartInstance,
  CandlestickSeriesDef } from '@wick-charts/react'` works without React
  installed; the wrappers tree-shake down to the engine.
- **`animations` deep-diff** — passing a fresh-but-equal `animations` object
  literal no longer destroys and rebuilds the chart on every render, in all
  three wrappers.

## 0.4 → 0.5

### Breaking: string `chart.addSeries('line', …)` requires registration

The chart no longer hard-imports the four series renderers — that made every
bundle carry candlestick + line + bar + pie even when the app rendered one
series type. `addSeries` now takes a *series definition*, and the framework
components (`<CandlestickSeries>`, `<LineSeries>`, …) pass theirs automatically,
so **component-based apps need no changes** and now bundle only the series they
import.

Imperative (vanilla) callers have two options:

```ts
// Option A — pass the definition (tree-shakeable, preferred)
import { CandlestickSeriesDef } from '@wick-charts/react';
const id = chart.addSeries(CandlestickSeriesDef, { bodyWidthRatio: 0.8 });

// Option B — keep the string form, register the built-ins once at startup
import { registerBuiltinSeries } from '@wick-charts/react';
registerBuiltinSeries(); // pulls all four renderers into the bundle
const id = chart.addSeries('candlestick', { bodyWidthRatio: 0.8 });
```

An unregistered string now throws
`Unknown series type 'candlestick'…` with the same guidance.

### Breaking: `perf: true` becomes `perf: perfHud()`

The chart no longer imports any perf code — the `perf` option now *carries*
it, so charts without instrumentation bundle none of it. The boolean and
option-object forms are gone:

```ts
// 0.4
new ChartInstance(el, { perf: true });
new ChartInstance(el, { perf: { hud: true, windowMs: 500 } });
new ChartInstance(el, { perf: { hud: false } });

// 0.5
import { perfHud, PerfMonitor } from '@wick-charts/react';

new ChartInstance(el, { perf: perfHud() });                  // monitor + HUD overlay
new ChartInstance(el, { perf: perfHud({ windowMs: 500 }) }); // same, with monitor options
new ChartInstance(el, { perf: new PerfMonitor() });          // instrument without a HUD
new ChartInstance(el, { perf: perfHud(sharedMonitor) });     // HUD on an external monitor
```

The same applies to the framework components: `<ChartContainer perf={perfHud()} />`
instead of `perf={true}`. Passing a bare `PerfMonitor` still works and still
leaves its lifecycle to the caller; `perfHud()`-created monitors are owned and
destroyed by the chart. The removed forms throw with this guidance.

### Breaking: the series `label` option is gone — names live in `data`

`LineSeries`, `BarSeries`, and `CandlestickSeries` no longer take a `label`
option. A series/layer name (and, for line/bar, an optional `color`) now rides
in the `data` prop. This lets a multi-layer chart name **each layer** — the
tooltip *and* legend show that per-layer name. Previously the single series
`label` was repeated across every layer in the tooltip while the legend
suffixed `1` / `2` / `3`; they now agree.

```tsx
// 0.4 — one label for the whole series
<LineSeries data={[revenue]} options={{ label: 'Revenue', colors: ['#f00'] }} />

// 0.5 — name (and optionally color) the layer in the data
<LineSeries data={{ label: 'Revenue', color: '#f00', data: revenue }} />

// multi-layer: each layer is named independently
<LineSeries
  data={[
    { label: 'Revenue', data: revenue },
    { label: 'Costs', data: costs },
  ]}
/>

// candlestick names its stream the same way
<CandlestickSeries data={{ label: 'BTC', data: candles }} />
```

The `data` prop is now **omnivorous** — a flat `TimePoint[]`, layered
`TimePoint[][]`, a single `{ label, color?, data }`, or an array mixing raw
and named layers all work and normalize internally. Unnamed layers in a
multi-layer series auto-name `Series 1`, `Series 2`, …

### Breaking: the `colors` option is gone — color lives in the theme + `data`

`LineSeries` and `BarSeries` no longer take a `colors` option. Colors come from
the theme by default, with a per-layer `data.color` override:

```tsx
// 0.4
<LineSeries data={[a, b]} options={{ colors: ['#f00', '#0f0'] }} />
<BarSeries data={[pnl]} options={{ colors: [up, down] }} /> // colors[0]=up, colors[1]=down

// 0.5 — color rides in the data (or just use the theme)
<LineSeries data={[{ color: '#f00', data: a }, { color: '#0f0', data: b }]} />
<BarSeries data={[pnl]} /> // green-up / red-down comes from theme.bar.color
```

`data.color` (and the new **`theme.bar.color`**) is a `ValueColor` =
`string | ((value) => string)`. The function form colors a **bar per bar** and
a **line by its latest value**, so sign / threshold coloring needs no option:

```tsx
<BarSeries data={{ color: (v) => (v >= 0 ? up : down), data }} />
```

Theme defaults: a single line is `theme.line.color`, a single bar is the new
`theme.bar.color` (a sign value-fn), and multi-layer series use
`theme.seriesColors`. Because `theme.bar.color` may be a function, a theme is
**no longer guaranteed JSON-serializable** — an accepted trade-off; the docs
theme editor simply omits the function.

## 0.2 → 0.3

Version 0.3 restructures `ChartTheme` so every key lives where it semantically belongs. Confusing flat keys like `typography.axisFontSize` (shared across axes, legend, tooltips) and `candlestick.upColor` / `wickUpColor` (direction and part mixed at one level) are gone. Font sizes move into their owning sections; candlestick nests by direction first. Series renderer options (`CandlestickSeriesOptions`) follow the same restructure so instance overrides stay consistent with the theme.

### Breaking: `typography` only carries `fontFamily` + base `fontSize`

Other size knobs move into the section they describe:

```ts
// 0.2
theme.typography.axisFontSize      // used by axis ticks, legend, crosshair label, tooltip sub-text
theme.typography.yFontSize         // the floating YLabel price badge (misleadingly named)
theme.typography.tooltipFontSize

// 0.3
theme.axis.fontSize                // shared default for both axes + legend/crosshair/sparkline
theme.yLabel.fontSize
theme.tooltip.fontSize
```

`theme.typography` now contains only `{ fontFamily, fontSize }`. `fontSize` is the base body-text size (titles, infobar, pie tooltip).

### New: per-axis overrides under `axis.x` / `axis.y`

`axis.fontSize` and `axis.textColor` are the shared defaults. If an axis needs to diverge, set an override:

```ts
axis: {
  fontSize: 10,
  textColor: '#787b86',
  y: { fontSize: 14, textColor: '#d1d4dc' },  // only Y diverges
}
```

Two helpers resolve the effective value at read time:

```ts
import { resolveAxisFontSize, resolveAxisTextColor } from '@wick-charts/react';

resolveAxisFontSize(theme, 'y');    // 14  (override)
resolveAxisFontSize(theme, 'x');    // 10  (shared default)
resolveAxisFontSize(theme);         // 10  (legend, crosshair, etc.)
```

### Breaking: `candlestick` nests by direction (`up` / `down`), not by part

```ts
// 0.2
candlestick: {
  upColor: '#089981',
  downColor: '#f23645',
  wickUpColor: '#089981',
  wickDownColor: '#f23645',
}

// 0.3
candlestick: {
  up:   { body: '#089981', wick: '#089981' },
  down: { body: '#f23645', wick: '#f23645' },
}
```

Same restructure applies to `CandlestickSeriesOptions` on `<CandlestickSeries options={...}>` / `addCandlestickSeries({...})`:

```ts
// 0.2
<CandlestickSeries options={{ upColor: '#0f0', wickUpColor: '#000' }} />

// 0.3
<CandlestickSeries options={{ up: { body: '#0f0', wick: '#000' } }} />
```

### New: `body` accepts a `[top, bottom]` gradient tuple. `bodyGradient` is gone.

Body shape now says everything:

```ts
candlestick: {
  up:   { body: ['#aaff00', '#008800'], wick: '#006600' },  // explicit 2-stop gradient
  down: { body: '#f23645',              wick: '#a01020' },  // flat fill
}
```

The old `bodyGradient: boolean` (and its deprecated alias `candleGradient`) flag on `CandlestickSeriesOptions` is removed. In 0.2, `bodyGradient: true` (default) applied an auto-derived 3-stop lighten/darken gradient to any single-color body. In 0.3, gradient vs. flat is encoded directly in the shape — a string is flat, a tuple is a gradient.

For the old "subtle vertical lift" look, wrap colors in the new `autoGradient` helper (ships in every framework entrypoint):

```ts
import { autoGradient, createTheme } from '@wick-charts/react';

createTheme({
  background: '#0f1117',
  candlestick: {
    up:   { body: autoGradient('#26a69a'), wick: '#26a69a' },  // [lighten, darken] tuple
    down: { body: autoGradient('#ef5350'), wick: '#ef5350' },
  },
});
```

All bundled presets (`githubLight`, `monokaiPro`, …) already use `autoGradient` so they look identical to 0.2.

For reading a flat color out of either form (e.g. coloring a legend swatch, an InfoBar value, or a change arrow), use `resolveCandlestickBodyColor`:

```ts
import { resolveCandlestickBodyColor } from '@wick-charts/react';

resolveCandlestickBodyColor(theme.candlestick.up.body);  // '#089981' or the top stop of a tuple
```

### Migration steps

1. Search-and-replace across your codebase:

   | Old                                     | New                                  |
   | --------------------------------------- | ------------------------------------ |
   | `typography.axisFontSize`               | `axis.fontSize`                      |
   | `typography.yFontSize`                  | `yLabel.fontSize`                    |
   | `typography.tooltipFontSize`            | `tooltip.fontSize`                   |
   | `candlestick.upColor`                   | `candlestick.up.body`                |
   | `candlestick.downColor`                 | `candlestick.down.body`              |
   | `candlestick.wickUpColor`               | `candlestick.up.wick`                |
   | `candlestick.wickDownColor`             | `candlestick.down.wick`              |

2. Custom themes via `createTheme({...})`: rename `candlestick: { upColor, downColor, ... }` to `candlestick: { up: { body }, down: { body } }`. `wick` defaults to `body` when omitted.

3. Direct `<CandlestickSeries options={...}>` overrides: same restructure as the theme. Drop any `bodyGradient` / `candleGradient` props — pass `body: autoGradient('#color')` to keep the subtle gradient, or a plain string for flat fill.

4. Anywhere you read a candle body color to tint unrelated UI (tooltip value text, change arrow, swatch), import `resolveCandlestickBodyColor` from your framework package — it returns a flat string whether the body is single-color or a gradient tuple.

## 0.1 → 0.2

Version 0.2 introduces scoped slot / render-prop support on every DOM overlay and cleans up the `seriesId` prop inconsistencies across them. The runtime surface (`ChartContainer`, series components, themes, hooks/composables/stores) is unchanged.

### Breaking: `seriesId` removed from `InfoBar` and `Tooltip`

Both components were already multi-series by design — passing `seriesId` narrowed them to one row, which didn't compose well with "show two of five" or "reorder columns" use cases. They now always render every visible series. Filter inside the slot when you need a subset:

```tsx
// 0.1
<Tooltip seriesId="btc" />

// 0.2
<Tooltip>
  {({ snapshots }) =>
    snapshots
      .filter((s) => s.seriesId === 'btc')
      .map((s) => (
        <div key={s.id}>{s.label}: {s.data.close}</div>
      ))
  }
</Tooltip>
```

Same shape in Vue (`<Tooltip v-slot="{ snapshots }">…</Tooltip>`) and Svelte (`<Tooltip let:snapshots>…</Tooltip>`).

Each snapshot carries `{ id, seriesId, layerIndex?, label?, color, data }`. `id` is unique (safe for React `key` / `v-for` `:key` / Svelte each-key). `seriesId` is the owning series (not unique with layered series) — use it for filtering or grouping.

### Non-breaking: `seriesId` is optional on `YLabel` / `PieTooltip` / `PieLegend`

Previously required. Omit the prop on single-series charts and the first compatible visible series is picked automatically:

- `YLabel` — first visible single-layer time series (falls back to first visible multi-layer time series).
- `PieTooltip`, `PieLegend` — first visible pie series.

Existing code that passes `seriesId` explicitly continues to work unchanged.

### New: public helpers for custom overlays

Re-exported from every framework package (`@wick-charts/react | vue | svelte`):

- `buildHoverSnapshots(chart, { time, sort?, cacheKey })` / `buildLastSnapshots(chart, { sort?, cacheKey })` — deeply frozen, structural-equality-cached snapshot arrays. Identical `(time, sort, cacheKey)` returns the same reference while `chart.getOverlayVersion()` is unchanged, so `React.memo` / Vue `computed` / Svelte `$:` skip renders on no-op mousemoves.
- `computeTooltipPosition({ x, y, chartWidth, chartHeight, tooltipWidth, tooltipHeight, offsetX?, offsetY? })` — flip + clamp positioning for a tooltip container you own.
- Types: `SeriesSnapshot`, `LegendItem`, `SliceInfo`, `HoverInfo`.

Use distinct `cacheKey` values when multiple overlays read at once (e.g. `'tooltip'`, `'infobar-hover'`) so they don't invalidate each other.

### New: `overlayChange` event

A superset of `dataUpdate` + `seriesChange` plus visibility toggles, series-option changes, and `setTheme`. Custom overlays should subscribe to this single event instead of stacking `dataUpdate` + `seriesChange`:

```ts
chart.on('overlayChange', rerender);
return () => chart.off('overlayChange', rerender);
```

Call `chart.getOverlayVersion()` for a monotonic number that bumps on every `overlayChange`.

### New: chart-introspection API on `ChartInstance`

- `getSeriesIdsByType(type: 'pie' | 'time', opts?: { visibleOnly?; singleLayerOnly? })`
- `getSeriesType(id)` → `'pie' | 'time' | null`
- `getStackedLastValue(id)` → `{ value, isLive } | null` (cumulative top of a stack; falls back to `getLastValue` for non-stacked series)
- `getLayerLastSnapshots(id)` → per-layer last points with per-layer `time` (ragged multi-layer streams); `null` for single-layer series.
