# Bar chart / histogram

`<BarSeries>` draws bars over time (or over categories), with several layers, stacking, colors by sign and value labels. A dataset with negative values gets a zero line by itself. Every option with its default: `BarSeriesOptions` in the installed types ([how to read them](SKILL.md#props-and-options-read-the-installed-types)), or <https://wick-charts.eeff.io/api/bar-series/>.

## Data and colors

The same shapes as `LineSeries`: `{ time, value }` points (`value` can be negative, `null` is a gap), one array per layer, or named `{ label?, color?, data }` layers. There is no `label` or `colors` option.

- **One layer** takes `theme.bar.color`, which colors positive bars with the up color and negative bars with the down color.
- **Several layers** take the `theme.seriesColors` palette.
- **A layer `color`** overrides the theme. A `color` function runs for each bar, so a sign or threshold color needs no option.

```ts
data={{ color: '#26a69a', data }}                                   // one color
data={{ color: (v) => (v >= 0 ? '#26a69a' : '#ef5350'), data }}     // a color for each bar
data={[
  { label: 'Buys', color: '#26a69a', data: buys },
  { label: 'Sells', color: '#ef5350', data: sells },
]}
```

## Options with a trap

### `stacking`

| Mode | Result |
|---|---|
| `'off'` | Time or numeric axis: the layers overlap. Category axis: the layers stand side by side in each band (grouped). Negative values work. |
| `'normal'` | The layers stack on each other |
| `'percent'` | Each layer is its share of the column's absolute sum, so a column spans 100% across zero (+3 and −1 → +75% up, −25% down). Tooltip rows show the share before the value. |

### `valueLabels`

Text just past the free end of each bar: above a positive bar, below a negative one. A `'normal'` stack gets one label per signed stack, with its total; `'percent'` stacks and overlapping layers on a time or numeric axis get none. A label wider than its bar is skipped. The text uses the Y axis format (`<YAxis format>`) unless `{ format }` sets its own.

```tsx
<BarSeries data={layers} options={{ valueLabels: { format: (v) => `$${v}M` } }} />
```

## React

```tsx
import { BarSeries, ChartContainer, Crosshair, TimeAxis, type TimePoint, Tooltip, YAxis } from '@wick-charts/react';

export function Histogram({ data }: { data: TimePoint[] }) {
  return (
    <ChartContainer style={{ height: 400 }}>
      <BarSeries data={data} options={{ barWidthRatio: 0.6 }} />
      <Tooltip />
      <Crosshair />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}
```

Stacked layers with a legend:

```tsx
<ChartContainer style={{ height: 400 }}>
  <BarSeries
    data={[
      { label: 'Revenue', color: '#ff6b6b', data: revenue },
      { label: 'Costs', color: '#4ecdc4', data: costs },
    ]}
    options={{ stacking: 'normal' }}
  />
  <Tooltip />
  <YAxis />
  <TimeAxis />
  <Legend position="bottom" />
</ChartContainer>
```

## Vue

```vue
<script setup lang="ts">
import { BarSeries, ChartContainer, Crosshair, TimeAxis, type TimePoint, Tooltip, YAxis } from '@wick-charts/vue';

defineProps<{ data: TimePoint[] }>();
</script>

<template>
  <ChartContainer style="height: 400px">
    <BarSeries :data="data" :options="{ barWidthRatio: 0.6 }" />
    <Tooltip />
    <Crosshair />
    <YAxis />
    <TimeAxis />
  </ChartContainer>
</template>
```

## Svelte

```svelte
<script lang="ts">
  import { BarSeries, ChartContainer, Crosshair, TimeAxis, type TimePoint, Tooltip, YAxis } from '@wick-charts/svelte';

  let { data }: { data: TimePoint[] } = $props();
</script>

<ChartContainer style="height:400px">
  <BarSeries {data} options={{ barWidthRatio: 0.6 }} />
  <Tooltip />
  <Crosshair />
  <YAxis />
  <TimeAxis />
</ChartContainer>
```

## Category bars

On a category X axis (`axis={{ x: { type: 'category' } }}`) points carry `x: string`. Each category gets a band and the bars fill it (`barWidthRatio` is ignored; `axis.x.padding.inner` sets the gap). More about the axis: [axes.md](axes.md#numeric-and-category-x-axes).

- **Grouped:** one multi-layer series with `stacking: 'off'` puts its layers side by side in each band. Two separate `BarSeries` overlap instead.
- **Stacked:** `'normal'` and `'percent'` draw one column per band.
- **Order:** `axis.x.categories: string[]` puts the listed names first, in list order, with an empty band for a name without data; the rest follow in first-seen order.
- **Hover:** the hovered category gets a backdrop (`theme.bar.hoverBackground`) and the tooltip lists each layer.
- **Updates:** bars ease to new values; a category that arrives or leaves fades in or out, and the other bands slide.

```tsx
<ChartContainer axis={{ x: { type: 'category', categories: ['Europe', 'Asia', 'Americas'] } }}>
  <BarSeries
    data={[
      { label: '2024', data: [{ x: 'Europe', value: 46 }, { x: 'Asia', value: 41 }] },
      { label: '2025', data: [{ x: 'Europe', value: 49 }, { x: 'Asia', value: 47 }] },
    ]}
    options={{ valueLabels: true }}
  />
  <XAxis />
  <YAxis />
  <Tooltip />
</ChartContainer>
```

## Common patterns

- **Volume bars from candles:** `ohlc.map((d) => ({ time: d.time, value: d.volume ?? 0 }))`. A `CandlestickSeries` with `volume` in its data already draws volume bars.
- **A MACD-style histogram:** one layer of signed values; the theme's `bar.color` already colors the signs.
- **Percent-stacked bars:** `options={{ stacking: 'percent' }}`.
- **A tooltip with stack totals:** a multi-layer series gives one snapshot per visible layer (with `layerIndex`); group the rows by `seriesId` in a custom tooltip ([overlays.md](overlays.md#custom-content)).
