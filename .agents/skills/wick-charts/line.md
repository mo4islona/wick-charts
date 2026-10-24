# Line / area chart

`<LineSeries>` draws one or more lines over time, with an optional gradient area, stacking, threshold colors and a pulse at the live end. Every option with its default: `LineSeriesOptions` in the installed types ([how to read them](SKILL.md#props-and-options-read-the-installed-types)), or <https://wick-charts.eeff.io/api/line-series/>.

## Data

A point is `{ time, value }` — `time` in epoch ms or a `Date`, and `value: null` for a gap (the line breaks and the tooltip skips it).

```ts
data={points}                     // one line
data={[pointsA, pointsB]}         // several lines (layers)
data={{ label: 'Revenue', color: '#00d4aa', data: revenue }}   // a named, colored line
data={[
  { label: 'Revenue', color: '#4ecdc4', data: revenue },
  { label: 'Costs', color: '#ff6b6b', data: costs },
]}
data={{ color: (v) => (v >= 0 ? '#46b78f' : '#f0556a'), data }}  // color by the latest value
```

There is no `label` or `colors` option: the name and color ride in the data. Without a `color`, a single-layer first series takes `theme.line.color`; the layers of a multi-layer series and the series after the first take `theme.seriesColors` slots. Unnamed layers of a multi-layer series show as `Series N` in the tooltip and legend.

## Options with a trap

### `area`

`area: { visible: true }` fills a vertical gradient under the line; with stacking, each layer fills down to the layer below it.

`area.baseline` closes the fill to a Y value instead of the bottom of the plot: the fill runs from the line to that value on both sides of it, and fades toward it. Y autoscale keeps the baseline in view; a baseline outside a fixed Y range clamps to the plot edge. Pair it with a `threshold` at the same value for a two-color P&L chart. Ignored in stacked mode.

```ts
// P&L around zero: green above, red below, each fading toward 0
options={{ area: { visible: true, baseline: 0 }, threshold: { value: 0, above: '#46b78f', below: '#f0556a' } }}
```

### `stacking`

| Mode | Result |
|---|---|
| `'off'` | Each layer on its own; lines overlap |
| `'normal'` | Layers stack: each layer's Y is the sum of the layers below it and its own value |
| `'percent'` | Like `'normal'`, scaled to 0–100% of the column total; a column with a total of 0 is a gap. Tooltip rows show the share before the value |

### `threshold`

Paints the stroke and the area one color above a Y `value` and another below it. The split sits at that value's pixel row, so it follows the Y axis as it autoscales.

```ts
options={{ threshold: { value: 70, above: '#f0556a' } }}                      // red above 70
options={{ threshold: { value: 0, above: '#46b78f', below: '#f0556a' } }}     // both sides
```

A `color` function in the data colors the whole line by its latest value; `threshold` colors by position, so one line shows two colors at once, and it wins over the data color. Unstacked lines only.

### `points`

Dots at each data point, for sparse series where each sample matters: `options={{ points: { visible: true, radius: 4 } }}`. When the dots get too dense to read (far zoomed out), they hide until the user zooms in.

## React

```tsx
import { ChartContainer, Crosshair, dracula, LineSeries, TimeAxis, type TimePoint, Tooltip, YAxis } from '@wick-charts/react';

export function LineChart({ data }: { data: TimePoint[] }) {
  return (
    <ChartContainer theme={dracula.theme} style={{ height: 400 }}>
      <LineSeries data={{ color: '#00d4aa', data }} options={{ area: { visible: true }, pulse: true }} />
      <Tooltip />
      <Crosshair />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}
```

Stacked areas with a legend:

```tsx
<ChartContainer style={{ height: 400 }}>
  <LineSeries
    data={[
      { label: 'Revenue', color: '#ff6b6b', data: revenue },
      { label: 'Costs', color: '#4ecdc4', data: costs },
      { label: 'Profit', color: '#45b7d1', data: profit },
    ]}
    options={{ area: { visible: true }, stacking: 'normal' }}
  />
  <Tooltip sort="desc" />
  <Legend position="bottom" mode="toggle" />
</ChartContainer>
```

## Vue

```vue
<script setup lang="ts">
import { ChartContainer, Crosshair, dracula, LineSeries, TimeAxis, type TimePoint, Tooltip, YAxis } from '@wick-charts/vue';

const props = defineProps<{ data: TimePoint[] }>();
</script>

<template>
  <ChartContainer :theme="dracula.theme" style="height: 400px">
    <LineSeries :data="{ color: '#00d4aa', data: props.data }" :options="{ area: { visible: true }, pulse: true }" />
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
  import { ChartContainer, Crosshair, dracula, LineSeries, TimeAxis, type TimePoint, Tooltip, YAxis } from '@wick-charts/svelte';

  let { data }: { data: TimePoint[] } = $props();
</script>

<ChartContainer theme={dracula.theme} style="height:400px">
  <LineSeries data={{ color: '#00d4aa', data }} options={{ area: { visible: true }, pulse: true }} />
  <Tooltip />
  <Crosshair />
  <YAxis />
  <TimeAxis />
</ChartContainer>
```

## Common patterns

- **A plain line:** `options={{ area: { visible: false }, pulse: false }}`.
- **A percent-stacked area:** `options={{ area: { visible: true }, stacking: 'percent' }}`.
- **An indicator over candles:** `<LineSeries data={{ label: 'SMA 20', color: '#ffd700', data: sma }} options={{ strokeWidth: 1, area: { visible: false }, pulse: false }} />` next to a `CandlestickSeries`.
- **A small dashboard line:** no overlays, `interactive={false}`, `grid={{ visible: false }}`, `axis={{ y: { visible: false }, x: { visible: false } }}` and `style={{ height: 60, minHeight: 0 }}`. In React, `Sparkline` does this with a value label ([sparkline.md](sparkline.md)).
- **A custom tooltip** that shows some of the lines: [overlays.md](overlays.md#custom-content).
