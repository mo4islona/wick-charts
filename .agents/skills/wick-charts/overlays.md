# Overlays: tooltips, legends, axes, labels

Overlays are children of `ChartContainer`. Their props are in the installed types (`TooltipProps`, `LegendProps`, …).

| Component | Slot context | What it is |
|---|---|---|
| `Title` | — | Title bar above the plot (`sub` for a subtitle) |
| `InfoBar` | `{ snapshots, time, isHover }` | Values of every series: at the cursor, else at the last point |
| `Tooltip` | `{ snapshots, time }` | Floating tooltip near the cursor, hover only |
| `Legend` | `{ items }` | Series list below (or right of) the plot; a click toggles a series |
| `Crosshair` | — | Cursor lines with labels on the axes |
| `YAxis` | — | Y ticks; `scale="id"` for a named scale |
| `XAxis` (alias `TimeAxis`) | — | X ticks for any `axis.x.type` |
| `YLabel` | `{ value, y, bgColor, isLive, direction, format, opacity }` | Badge with the last value of a series, and a dashed line |
| `NumberFlow` | — | Animated number, also usable outside a chart |
| `PieTooltip` / `PieLegend` | `{ info, format }` / `{ slices, mode, format }` | Pie hover tooltip / slice list |
| `HeatmapTooltip` | — | Heatmap cell tooltip |
| `SankeyTooltip` | `{ info, format }` | Sankey node or link tooltip |

Annotations (`Marker`, `ReferenceLine`, `TimeRegion`): [annotations.md](annotations.md). `Navigator`: [realtime.md](realtime.md#navigator).

- **`InfoBar` and `Tooltip` show every visible series**; they have no `seriesId`. Filter the rows in a custom slot.
- **`seriesId` is optional** on `YLabel`, `PieTooltip`, `PieLegend`, `HeatmapTooltip` and `SankeyTooltip`. Without it they use the first visible series that fits (for `YLabel`, a time series that is not a band).
- **`Tooltip` and `InfoBar` work together:** the tooltip floats at the cursor, the info bar sits in the header.
- **Header:** `Title` and `InfoBar` float over the top of the plot and push the data down by their height (`headerLayout` on `ChartContainer` changes this). The tooltip draws above them.
- **`Legend`:** `position="bottom" | "right"`; `mode="toggle"` (default) hides and shows a series, `mode="isolate"` shows only the clicked one and a second click shows all. `onToggle(info)` reports each click; `items` replaces the list with static `{ label, color }` entries.
- **`PieLegend`:** `mode="value" | "percent" | "both"` (default `'both'`), `position="bottom" | "right" | "overlay"`.

## Number format

Each overlay that shows a number takes a `format` prop. On `Tooltip` and `InfoBar` it is `(value, field) => string` with `field` one of `'open' | 'high' | 'low' | 'close' | 'volume' | 'value'`; elsewhere `(value) => string`. `<YAxis format>` also formats the crosshair Y label and the `YLabel` badge, and `<XAxis format>` the crosshair X label and the tooltip header.

Shared helpers from every framework package:

- `formatSignificant(v, { digits?, collapseZeros?, compactFrom?, trimZeros? })` keeps the digits that carry the value: `0.00000812` → `0.0₅812`, `1234567890` → `1.235B`, `5.4e15` → `5.4×10¹⁵`, and `68,432.17` between them. The `NumberFlow` default.
- `collapseZeros(text)` collapses the leading zeros of any formatted string: `0.000008123` → `0.0₅8123`.
- `formatTooltipValue` is the `Tooltip` / `InfoBar` default: compact volume, and prices with fixed digits so a live row keeps its width. A series of whole numbers prints them without decimals.
- `formatCompact` (K / M / B / T) and `formatPriceAdaptive` (full precision).

The Y ticks, the `YLabel` badge, the crosshair label, `Tooltip` and `InfoBar` collapse leading zeros by default, so a low price (`0.0000081`) needs no custom `format`.

## Custom content

Each overlay with a slot context lets you replace its content and keep the position, the crosshair wiring and the data in the library. React uses a function child, Vue a default scoped slot, Svelte a `let:` slot (it also works from a runes component). The context is the same in the three.

`snapshot.data` is an `OHLCData`, a `TimePoint` or a `BandPoint`: narrow it before you read a field.

```tsx
function valueOf(data: SeriesSnapshot['data']): string {
  if ('close' in data) return data.close.toFixed(2);
  if ('value' in data) return data.value.toFixed(2);

  return `${data.low.toFixed(2)} – ${data.high.toFixed(2)}`;
}

<Tooltip>
  {({ snapshots, time }) => (
    <div>
      <small>{new Date(time).toLocaleTimeString()}</small>
      {snapshots
        .filter((s) => s.seriesId === 'btc' || s.seriesId === 'eth')
        .map((s) => (
          <div key={s.id} style={{ color: s.color }}>
            {s.label}: {valueOf(s.data)}
          </div>
        ))}
    </div>
  )}
</Tooltip>
```

```vue
<!-- valueOf: the same helper, in <script setup> -->
<Tooltip v-slot="{ snapshots, time }">
  <div>
    <small>{{ new Date(time).toLocaleTimeString() }}</small>
    <div v-for="s in snapshots.filter((x) => x.seriesId === 'btc' || x.seriesId === 'eth')" :key="s.id" :style="{ color: s.color }">
      {{ s.label }}: {{ valueOf(s.data) }}
    </div>
  </div>
</Tooltip>
```

```svelte
<Tooltip let:snapshots let:time>
  <small>{new Date(time).toLocaleTimeString()}</small>
  {#each snapshots.filter((s) => s.seriesId === 'btc' || s.seriesId === 'eth') as s (s.id)}
    <div style="color: {s.color}">{s.label}: {valueOf(s.data)}</div>
  {/each}
</Tooltip>
```

- **Rows (`SeriesSnapshot`):** key a row by `id`, which is unique in the array; filter and group by `seriesId`, which repeats across the layers of one series. `layerIndex` is set on the rows of a multi-layer series, and `share` on a percent stack. `data` is frozen: read it, do not change it.
- **`InfoBar`** also gives `isHover`: `true` while the cursor is on the chart, `false` when it shows the last values.
- **`Tooltip`** renders nothing while no crosshair is active.
- **`Legend` items** carry `toggle()` and `isolate()` bound to the item, so you can sort or filter the array and keep the visibility wiring.
- **`YLabel`:** position your content with `y` (the pixel Y of the badge).
- **`PieTooltip` / `SankeyTooltip`:** `info` is the `HoverInfo` of the slice, node or link; the library keeps the tooltip inside the chart.

The slot context does not change on each mouse move: the snapshots keep the same reference while the cursor stays on one data point, so `memo(Rows, (a, b) => a.snapshots === b.snapshots)` in React, a Vue `computed` or a Svelte `$derived` skips those renders. For pixel coordinates, read `useCrosshairPosition(chart)` ([custom-overlays.md](custom-overlays.md)).
