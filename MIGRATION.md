# Migration guide

## 0.3 → 0.4 — unified animation pipeline

Animations in 0.3 were driven by three independent `requestAnimationFrame` loops (main canvas, overlay canvas, navigator) plus per-renderer wall-clock chase math, plus a frame-count-based Y-axis smoothing — each on its own time base. Streaming a new point read as four offset motions instead of one. 0.4 collapses everything onto a shared `AnimationClock`: one RAF per chart, one `now` / `dt` / `frameId` shared by every animation domain. Y-axis labels (TimeAxis / YAxis) now slide via `transform: translate3d(...)` so they ride the same frame as the canvas series.

**No breaking changes to the public API.** Field names, option shapes, defaults, and existing event names are preserved. The changes below are all additive or internal.

### Behavior change: `animations.viewport.yAxisMs` is now wall-clock

The field name and default (80 ms) are unchanged, but the underlying math switched from a frame-count closure (`min(1, 16 / yAxisMs)` of the gap per render) to a wall-clock exponential chase (`smoothToward(rate = 1000 / yAxisMs, dt)`). At 60 Hz the perceptual feel is identical (~19 % of the gap closes per frame, matching the legacy 0.2). At 120 / 30 Hz the new chase reaches the same wall-clock convergence regardless of refresh rate — the old code visibly raced on 120 Hz monitors and dragged on 30 Hz. If you tuned `yAxisMs` against the old frame-count math and the new wall-clock feel is off, the same numeric range applies; nudge up to slow, down to speed up.

### New: `animations.viewport.navigatorSmoothMs`

The mini-chart in `NavigatorController` now exponentially chases its data extent instead of jumping each tick. Default **120 ms** (slightly slower than `points.smoothMs` so the navigator reads as background inertia, not reactive echo). `setData` and history-prepend events skip the chase via the new `'dataReplaced'` chart event (see below).

```ts
animations: { viewport: { navigatorSmoothMs: 120 } }
animations: { viewport: { navigatorSmoothMs: false } } // disable — snap each tick
```

### New: `'dataReplaced'` chart event

`ChartInstance` now distinguishes full data replacements (`setSeriesData`) from streaming updates (`appendData` / `updateData`):

```ts
chart.on('dataReplaced', () => { /* navigator snaps, etc. */ });
chart.on('dataUpdate',   () => { /* fires on every change, including replace */ });
```

`'dataUpdate'` is **additive** — it still fires on every change, including replacements, so existing listeners keep working. `'dataReplaced'` fires _in addition_ when the change came from `setSeriesData`. Hosts that maintain chase state (custom mini-charts, reveal animations) should listen to `'dataReplaced'` and snap instead of animating across the discontinuity.

### New: `chart.subscribeFrame(...)` / `chart.scheduleNextFrame()` / `chart.requestFrame(...)`

External integrations (Navigator and any custom overview component) can now ride the chart's frame clock without spinning their own `requestAnimationFrame` loop:

```ts
const unsub = chart.subscribeFrame(({ now, dt, frameId }) => { /* ... */ });
chart.scheduleNextFrame();              // ensure another RAF without dirtying chart paint
chart.requestFrame('main' | 'overlay'); // request a chart paint
```

### New: `chart.getDataBounds()` is public

Was internal in 0.3. Now public so external mini-chart components can read the current data extent without poking into private series state.

### Internal: `RenderScheduler` deprecated

`RenderScheduler` (`packages/core/src/render-scheduler.ts`) still exists as a thin shim for any code that imported it directly via deep-import — but its role inside `ChartInstance` moved to the new `AnimationClock`. Will be removed in 0.5; new code should use the chart-level frame APIs above.

### Internal: render-context fields `now` / `dt` / `frameId`

`SeriesRenderContext` and `OverlayRenderContext` gained three required fields supplied by the chart: `now: DOMHighResTimeStamp`, `dt: number` (seconds since previous frame, clamped to 50 ms), and `frameId: number` (monotonic counter). Built-in renderers read these instead of `performance.now()`. **Custom renderer implementations** that build their own context objects (rare — most users register series via the public `addLineSeries` / `addCandlestickSeries` / etc.) must add the fields. The render-context test helper (`buildRenderContext`) now auto-derives them from `performance.now()` so existing tests don't need updating.

---

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
