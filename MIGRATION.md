# Migration guide

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
