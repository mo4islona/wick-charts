# Axes and scales

## Hide an axis

Leaving out `<YAxis />` keeps its empty column; `axis: { y: { visible: false } }` removes it. The X axis is the same: leaving out `<XAxis />` keeps its row, and `axis.x.visible: false` removes it.

## Y axis mapping (log scale)

`axis.y.scale` maps values to the Y axis. Omit it for linear, pass `logScale()` for a log axis (`logScale({ base: 2 })` for powers-of-two ticks), or any `{ forward, inverse, isPlottable?, ticks?, format? }` object. Define it outside the component: a new object refits the Y range.

```tsx
const LOG = logScale();

<ChartContainer axis={{ y: { scale: LOG } }}>
```

Autoscale and the Y animations run in the scale's space. A value the scale cannot place (≤ 0 on a log axis) is skipped: a gap in a line, no bar or candle. A percent-stacked series throws when the scale cannot place 0.

## A second Y scale

Two unrelated measures on one pane (price and RSI, rate and error rate): name a scale in `scales` on `ChartContainer` and put a series on it with `scale`. Each scale autoscales from its own visible series; the time axis is shared.

```tsx
// The type keeps `'left'` a literal. A `scale: logScale()` inside must be created once, as on axis.y.
const SCALES: Record<string, YAxisConfig> = { rsi: { position: 'left', min: 0, max: 100 } };

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

- A scale takes the `axis.y` fields (`YAxisConfig`), and changes apply live. `position` defaults to the side opposite the default axis; `visible: false` makes an overlay scale: autoscaled, with no axis column.
- `scale` works on `LineSeries`, `BarSeries`, `CandlestickSeries` and `BandSeries`. Without it, or with an id that `scales` does not define (a dev warning), the series uses the default scale.
- One visible axis column fits on each side: a second scale on a taken side becomes an overlay scale (a dev warning). Grid lines follow the default scale.
- `<YAxis scale="id">` draws that scale's column; its `format` also formats that side's `Crosshair` label and the `YLabel` badge on that scale. `YLabel`, `ReferenceLine` and `Marker` take `scale`; `YLabel` defaults to its series' scale. Tooltip rows show each series' own values.
- Imperative: `chart.setScales(scales)`, `chart.getYScale(id)`, `chart.getSeriesScale(seriesId)`.

## Numeric and category X axes

`axis.x.type` sets what the X axis maps: `'time'` (default), `'numeric'` or `'category'`. Points then carry `x` instead of `time` — line and bar `{ x, value }`, band `{ x, low, high }` (`XPointInput`, `XBandPointInput`).

```tsx
// numeric: a curve over plain numbers; irregular spacing is fine
<ChartContainer axis={{ x: { type: 'numeric' } }}>
  <LineSeries data={[{ x: 1, value: 120 }, { x: 16, value: 840 }, { x: 64, value: 1020 }]} />
  <XAxis format={(x) => `${x} conn`} />
  <YAxis />
  <Crosshair />
  <Tooltip />
</ChartContainer>

// category: one band per name; bars fill their band
<ChartContainer axis={{ x: { type: 'category', padding: { inner: 0.3, outer: 0.2 } } }}>
  <BarSeries data={[{ x: 'EU', value: 42 }, { x: 'Asia', value: 35 }]} />
  <XAxis />
  <YAxis />
</ChartContainer>
```

- `type` is read at mount; a later change is ignored with a dev warning. Remount (a React `key`) to switch.
- **Numeric:** a linear mapping with 1-2-5 ticks (`labelCount` / `minLabelSpacing` on `<XAxis>`), locale number labels, pan and zoom as on time.
- **Category:** the categories come from the data in first-seen order. `axis.x.categories: string[]` fixes the order: the listed names come first (a name without data gets an empty band), and the rest follow in first-seen order. `axis.x.padding` is `{ inner, outer }` in fractions of a band. Bars fill the band (`barWidthRatio` is ignored); lines and bands run through the band centres; long labels end in an ellipsis. Pan and zoom are off. Grouped and stacked bars: [bar.md](bar.md#category-bars).
- `<XAxis>` (alias `<TimeAxis>`) `format(x, step)` also formats the crosshair label and the tooltip and info-bar headers.
- `CrosshairPosition.x` and `PointClickInfo.x` hold the domain value (epoch ms, a number or the category name); `time` is the internal coordinate (the band index on a category axis).
- Line, bar and band work on every axis type; candlestick needs time and depth needs numeric — `addSeries` throws otherwise. `Navigator`, `EdgeLoader`, `onEdgeReached` and `TimeRegion` are time-only (disabled with a dev warning).
- A point whose `x` does not fit the axis (a string on numeric, a number on category) is skipped with a dev warning.
