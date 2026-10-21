# Bar / Histogram Chart

Time-series bar chart with multi-layer support, stacking modes, positive/negative color handling, and automatic zero-line.

## Data format

```ts
interface TimePoint {
  time: number;   // timestamp in milliseconds (Date.now() style)
  value: number;  // can be negative
}

// Also accepts Date objects for time, and null for a gap (the line breaks, the tooltip skips it):
type TimePointInput = { time: number | Date; value: number | null };
```

**The `data` prop accepts either a flat single layer or an array of layers** (`TimePointInput[] | TimePointInput[][]`). A flat array is normalized to `[data]` internally.

```ts
// Single layer — flat array (no wrapping needed)
data={myData}

// Single layer — explicit (equivalent)
data={[myData]}

// Multi-layer
data={[layer1, layer2, layer3]}
```

`time` accepts epoch milliseconds (`Date.now()` style) or a `Date` object on every entry.

### Naming / coloring layers

There is **no `label` or `colors` option** — a layer's name and color ride in the data via `{ label?, color?, data }`. By default a single bar series is colored by the theme's **`bar.color`** (green-up / red-down by sign); multi-layer bars use the `theme.seriesColors` palette. A per-layer `color` overrides it.

`color` is a `ValueColor` = `string | ((value) => string)`. For bars the **function is evaluated per bar**, so sign / threshold coloring needs no option.

```ts
// Named, colored layers
data={[
  { label: 'Buys', color: '#26a69a', data: buys },
  { label: 'Sells', color: '#ef5350', data: sells },
]}

// Color each bar by value (this is what the theme does by default)
data={{ color: (v) => (v >= 0 ? '#26a69a' : '#ef5350'), data }}
```

## Series options

```ts
interface BarSeriesOptions {
  barWidthRatio: number;                   // 0–1, bar width relative to interval — default: 0.6
  stacking: 'off' | 'normal' | 'percent';  // layer stacking — default: 'off'
  entryAnimation?: 'none' | 'fade' | 'grow' | 'slide' | 'fade-grow'; // default: 'fade-grow'
  entryMs?: number | false;                // entrance duration; false disables — default: 250
  smoothMs?: number | false;               // live-tracking smoothing for updateLastPoint — default: 250
  cornerRadius?: number;                   // free-end corner radius, CSS px — default: 2
  valueLabels?: boolean | { format?: (value: number) => string }; // value text past each bar end — default: off
}
```

All options are optional — pass `Partial<BarSeriesOptions>`.

> Prefer the chart-level animations API (`<ChartContainer animations={{ series: { bar: { entry, smooth } } }}>`) for new code — it's the canonical surface and groups durations alongside axis / toggle timings. The per-series `entryMs` / `smoothMs` options still work and are the only place to set them per-series-instance. See [SKILL.md → Animations](SKILL.md).

## Options explained

### Coloring (no `colors` option)

Colors come from the theme, overridable per layer in the `data`:

**Single layer:** defaults to `theme.bar.color` — a value-fn that paints positive bars the up color and negatives the down color. Override with a per-layer `color`:

```ts
// Custom sign coloring via a value-fn
data={{ color: (v) => (v >= 0 ? '#26a69a' : '#ef5350'), data }}

// Or a flat color (uniform bars)
data={{ color: '#26a69a', data }}
```

**Multi-layer:** each layer takes its palette color (`theme.seriesColors`); override individually:

```ts
data={[
  { color: '#ff6b6b', data: a },
  { color: '#4ecdc4', data: b },
  { color: '#45b7d1', data: c },
]}
```

### `barWidthRatio`

Fraction of the available interval width (0–1). At `0.6` (default), each bar takes 60% of the interval with 40% gap.

### `stacking`

| Mode | Behavior |
|------|----------|
| `'off'` | Time / numeric axis: tallest bar drawn first (behind), layers overlap. Category axis: layers stand side by side in each band (grouped), in layer order. Supports negative values |
| `'normal'` | Layers stack cumulatively on top of each other |
| `'percent'` | Each layer is its share of the column's absolute sum, so a column spans 100% across zero (+3 and −1 → +75% up, −25% down; all-positive data fills 0–100%). Tooltip rows show the share before the value |

### `valueLabels`

Canvas text just past each bar's free end — above a positive bar, below a negative one. A `'normal'` stack gets one label per signed stack with its total; `'percent'` stacks and layers overlapping on a time / numeric axis get none. A label wider than its bar is skipped. Default text: the Y axis format (`<YAxis format>`), else the axis tick format; `{ format }` overrides it. Color: `theme.bar.labelColor`; font: the theme font at `theme.axis.fontSize`.

```tsx
<BarSeries data={layers} options={{ valueLabels: { format: (v) => `$${v}M` } }} />
```

### Zero line

A horizontal line at y=0 is automatically rendered when the dataset contains negative values. No configuration needed.

## React

### Single layer (histogram)

```tsx
import { ChartContainer, BarSeries, Tooltip, Crosshair, YAxis, TimeAxis } from '@wick-charts/react';
import type { TimePoint } from '@wick-charts/react';

export function Histogram({ data }: { data: TimePoint[] }) {
  return (
    <ChartContainer style={{ width: '100%', height: 400 }}>
      <BarSeries
        data={{ color: (v) => (v >= 0 ? '#26a69a' : '#ef5350'), data }}
        options={{ barWidthRatio: 0.6 }}
      />
      <Tooltip />
      <Crosshair />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}
```

### Multi-layer stacked

```tsx
import { ChartContainer, BarSeries, Tooltip, Legend, YAxis, TimeAxis } from '@wick-charts/react';

<ChartContainer style={{ width: '100%', height: 400 }}>
  <BarSeries
    data={[
      { label: 'Revenue', color: '#ff6b6b', data: revenue },
      { label: 'Costs', color: '#4ecdc4', data: costs },
      { label: 'Profit', color: '#45b7d1', data: profit },
    ]}
    options={{ barWidthRatio: 0.6, stacking: 'normal' }}
  />
  <Tooltip />
  <YAxis />
  <TimeAxis />
  <Legend position="bottom" mode="toggle" />
</ChartContainer>
```

### Props

```ts
interface BarSeriesProps {
  data: MultiLayerData;                      // TimePointInput[] | TimePointInput[][] — flat or layered
  options?: Partial<BarSeriesOptions>;
  /** Stable series ID — reuse across overlays that target this series. */
  id?: string;
}
```

## Vue

### Single layer

```vue
<script setup lang="ts">
import { ChartContainer, BarSeries, Tooltip, Crosshair, YAxis, TimeAxis } from '@wick-charts/vue';
import type { TimePoint } from '@wick-charts/vue';

const props = defineProps<{ data: TimePoint[] }>();
const signColor = (v: number) => (v >= 0 ? '#26a69a' : '#ef5350');
</script>

<template>
  <ChartContainer style="width: 100%; height: 400px">
    <BarSeries
      :data="{ color: signColor, data: props.data }"
      :options="{ barWidthRatio: 0.6 }"
    />
    <Tooltip />
    <Crosshair />
    <YAxis />
    <TimeAxis />
  </ChartContainer>
</template>
```

### Multi-layer stacked

```vue
<template>
  <ChartContainer style="width: 100%; height: 400px">
    <BarSeries
      :data="[
        { label: 'Revenue', color: '#ff6b6b', data: revenue },
        { label: 'Costs', color: '#4ecdc4', data: costs },
        { label: 'Profit', color: '#45b7d1', data: profit },
      ]"
      :options="{ barWidthRatio: 0.6, stacking: 'normal' }"
    />
    <Tooltip />
    <YAxis />
    <TimeAxis />
    <Legend position="bottom" mode="toggle" />
  </ChartContainer>
</template>
```

### Props & Events

```ts
// Props
data: MultiLayerData  // TimePointInput[] | TimePointInput[][] — flat or layered
options?: Partial<BarSeriesOptions>
/** Stable series ID — reuse across overlays that target this series. */
id?: string
```

## Svelte

### Single layer

```svelte
<script lang="ts">
  import { ChartContainer, BarSeries, Tooltip, Crosshair, YAxis, TimeAxis, type TimePoint } from '@wick-charts/svelte';

  let { data }: { data: TimePoint[] } = $props();
</script>

<ChartContainer style="width:100%;height:400px">
  <BarSeries
    data={{ color: (v) => (v >= 0 ? '#26a69a' : '#ef5350'), data }}
    options={{ barWidthRatio: 0.6 }}
  />
  <Tooltip />
  <Crosshair />
  <YAxis />
  <TimeAxis />
</ChartContainer>
```

### Multi-layer stacked

```svelte
<ChartContainer style="width:100%;height:400px">
  <BarSeries
    data={[
      { label: 'Revenue', color: '#ff6b6b', data: revenue },
      { label: 'Costs', color: '#4ecdc4', data: costs },
      { label: 'Profit', color: '#45b7d1', data: profit },
    ]}
    options={{ barWidthRatio: 0.6, stacking: 'normal' }}
  />
  <Tooltip />
  <YAxis />
  <TimeAxis />
  <Legend position="bottom" mode="toggle" />
</ChartContainer>
```

### Props

```ts
data: MultiLayerData  // TimePointInput[] | TimePointInput[][] — flat or layered
options?: Partial<BarSeriesOptions>
/** Stable series ID — reuse across overlays that target this series. */
id?: string
```

## Category bars

On a category X axis (`axis={{ x: { type: 'category' } }}`) points carry `x: string`, each category gets a band and the bars fill it (`barWidthRatio` is ignored; `axis.x.padding.inner` sets the gap).

- **Grouped** — a multi-layer series with `stacking: 'off'` puts its layers side by side in each band, colored from `theme.seriesColors`. Two separate `BarSeries` still overlap.
- **Stacked** — `'normal'` / `'percent'` draw one column per band, as on a time axis.
- **Order** — `axis.x.categories: string[]` puts the listed names first, in list order, also one no series has data for (an empty band); the rest follow in first-seen order. Live.
- **Hover** — the hovered category gets a band backdrop behind its bars (`theme.bar.hoverBackground`) and no horizontal crosshair line; the tooltip lists every layer of it.
- **Updates** — bars ease to new values; a category that enters fades in while the later bars slide aside, one that leaves fades out at its own band before the bands close up and the later bars slide over (on the X axis curve and settle).

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

## Custom tooltip

`Tooltip` accepts a slot / render-prop that hands you the computed snapshots — replace the default layout with your own:

```tsx
<Tooltip>
  {({ snapshots, time }) => (
    <div>
      <small>{new Date(time).toLocaleTimeString()}</small>
      {snapshots.map((s) => (
        <div key={s.id} style={{ color: s.color }}>
          {s.label ?? s.seriesId}: {('value' in s.data ? s.data.value : 0).toFixed(2)}
        </div>
      ))}
    </div>
  )}
</Tooltip>
```

Multi-layer stacked bars produce one snapshot per visible layer (each carrying `layerIndex`). Group by `seriesId` if you want stack totals in the tooltip.

## Common patterns

### Volume histogram (standalone)

```ts
// Convert OHLC volume to bar data
const volumeData: TimePoint[] = ohlcData.map(d => ({
  time: d.time,
  value: d.volume ?? 0,
}));

<BarSeries
  data={{ label: 'Volume', color: '#4ecdc4', data: volumeData }}
  options={{ barWidthRatio: 0.8 }}
/>
```

### Percentage stacked bar

```ts
options={{ stacking: 'percent' }}
```

### MACD-style histogram with positive/negative

```ts
// Single layer: the theme's bar.color already paints positive bars up and negative bars down
options={{ barWidthRatio: 0.4 }}

// Or your own colors, chosen per bar
data={{ color: (v) => (v >= 0 ? '#26a69a' : '#ef5350'), data: macd }}
```
