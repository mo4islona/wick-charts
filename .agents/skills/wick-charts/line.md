# Line / Area Chart

Time-series line chart with area gradient fill, multi-layer support, stacking modes, and animated pulsing dot.

## Data format

```ts
interface TimePoint {
  time: number;   // timestamp in milliseconds (Date.now() style)
  value: number;
}

// Also accepts Date objects for time, and null for a gap (the line breaks, the tooltip skips it):
type TimePointInput = { time: number | Date; value: number | null };
```

**The `data` prop accepts either a flat single layer or an array of layers** (`TimePointInput[] | TimePointInput[][]`). A flat array is the common single-line case; it's normalized to `[data]` internally.

```ts
// Single line — flat array (no wrapping needed)
data={myData}

// Single line — explicit layer (equivalent)
data={[myData]}

// Multi-layer
data={[layer1, layer2, layer3]}
```

`time` accepts epoch milliseconds (`Date.now()` style) or a `Date` object on every entry — mixed arrays are fine.

### Naming / coloring layers

There is **no `label` or `colors` option** — a layer's name and color are carried in the data via `{ label?, color?, data }`. By default colors come from the theme (`theme.line.color` for the first single line, then the next free `theme.seriesColors` slots for further lines and for layers); a per-layer `color` overrides it.

`color` is a `ValueColor` = `string | ((value) => string)`. The function form colors the line at its latest value (e.g. red when currently down).

```ts
// One named, colored line
data={{ label: 'Revenue', color: '#00d4aa', data: revenue }}

// Several named lines — each gets its own tooltip/legend entry
data={[
  { label: 'Revenue', color: '#4ecdc4', data: revenue },
  { label: 'Costs',   color: '#ff6b6b', data: costs },
]}

// Color by value (threshold)
data={{ color: (v) => (v >= 0 ? '#46b78f' : '#f0556a'), data }}
```

## Options

Every option with its default and doc comment: `LineSeriesOptions` in the installed types ([how to read them](SKILL.md#props-and-options-read-the-installed-types)), or <https://wick-charts.eeff.io/api/line-series/>. The sections below cover what a type can't show.

> Prefer the chart-level animations API (`<ChartContainer animations={{ series: { line: { entry, smooth, pulse } } }}>`) for new code — it's the canonical surface and groups durations alongside axis / toggle timings. The per-series `entryMs` / `smoothMs` / `pulseMs` options still work and are the only place to set them per-series-instance. See [SKILL.md → Animations](SKILL.md).

### `area`

When `area.visible` is `true`, a vertical gradient fills the area below each line:
- Top: line color at 12% opacity
- Bottom: line color at 1% opacity

Works with stacking — each layer fills down to the layer below it.

### `stacking`

| Mode | Behavior |
|------|----------|
| `'off'` | Each layer rendered independently, overlapping |
| `'normal'` | Layers stack cumulatively — each layer's Y = sum of all layers below |
| `'percent'` | Like `'normal'` but normalized to 0–100% of total; a column whose total is 0 is a gap. Tooltip rows show the share before the value |

### `threshold`

Positional color split: paints the stroke **and** the area fill one color above a Y `value` and another below it. The switch is pinned to that value's pixel row — a vertical gradient, so it tracks the Y-axis as it autoscales. Makes a series visibly "go critical" past a limit (calm below the level, hot above it).

```ts
// Red above 70, series color below
options={{ threshold: { value: 70, above: '#f0556a' } }}

// Explicit color on both sides of zero
options={{ threshold: { value: 0, above: '#46b78f', below: '#f0556a' } }}
```

Distinct from the `data.color` callback above (which colors the whole line by its *latest value*): `threshold` colors by Y *position*, so one line reads two colors at once. It is positional and overrides `data.color` for the stroke/fill. Unstacked lines only.

### `points`

Dot markers at every data point — good for sparse series where each sample matters.

```ts
options={{ points: { visible: true } }}

// Bigger, custom-colored dots
options={{ points: { visible: true, radius: 4, color: '#ffd700' } }}
```

Dots ride the same animated geometry as the stroke (entrance unfurl, live smoothing, stacked cumulative). When visible points get too dense to read as discrete markers (average spacing under ~1.5 dot diameters, e.g. zoomed far out), dots are skipped for that frame and reappear on zoom-in. Works in both unstacked and stacked modes; in a stack each layer's dots sit on its upper edge.

## Performance

Automatic decimation kicks in when visible data points exceed 2x pixel width. Data is reduced to 1.5x pixels while preserving min/max extremes.

## React

### Single line with area fill

```tsx
import { ChartContainer, LineSeries, Tooltip, Crosshair, YAxis, TimeAxis, dracula } from '@wick-charts/react';
import type { TimePoint } from '@wick-charts/react';

export function LineChart({ data }: { data: TimePoint[] }) {
  return (
    <ChartContainer theme={dracula.theme} style={{ width: '100%', height: 400 }}>
      <LineSeries
        data={{ color: '#00d4aa', data }}
        options={{ strokeWidth: 1, area: { visible: true }, pulse: true }}
      />
      <Tooltip />
      <Crosshair />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}
```

### Multi-layer with stacking

```tsx
import { ChartContainer, LineSeries, Tooltip, Legend } from '@wick-charts/react';

<ChartContainer style={{ width: '100%', height: 400 }}>
  <LineSeries
    data={[
      { label: 'Revenue', color: '#ff6b6b', data: revenue },
      { label: 'Costs', color: '#4ecdc4', data: costs },
      { label: 'Profit', color: '#45b7d1', data: profit },
    ]}
    options={{ strokeWidth: 1, area: { visible: true }, stacking: 'normal' }}
  />
  <Tooltip sort="desc" />
  <Legend position="bottom" mode="toggle" />
</ChartContainer>
```

## Vue

### Single line

```vue
<script setup lang="ts">
import { ChartContainer, LineSeries, Tooltip, Crosshair, YAxis, TimeAxis, dracula } from '@wick-charts/vue';
import type { TimePoint } from '@wick-charts/vue';

const props = defineProps<{ data: TimePoint[] }>();
</script>

<template>
  <ChartContainer :theme="dracula.theme" style="width: 100%; height: 400px">
    <LineSeries
      :data="{ color: '#00d4aa', data: props.data }"
      :options="{ strokeWidth: 1, area: { visible: true }, pulse: true }"
    />
    <Tooltip />
    <Crosshair />
    <YAxis />
    <TimeAxis />
  </ChartContainer>
</template>
```

### Multi-layer with stacking

```vue
<template>
  <ChartContainer style="width: 100%; height: 400px">
    <LineSeries
      :data="[
        { label: 'Revenue', color: '#ff6b6b', data: revenue },
        { label: 'Costs', color: '#4ecdc4', data: costs },
        { label: 'Profit', color: '#45b7d1', data: profit },
      ]"
      :options="{ strokeWidth: 1, area: { visible: true }, stacking: 'normal' }"
    />
    <Tooltip sort="desc" />
    <Legend position="bottom" mode="toggle" />
  </ChartContainer>
</template>
```

## Svelte

### Single line

```svelte
<script lang="ts">
  import { ChartContainer, LineSeries, Tooltip, Crosshair, YAxis, TimeAxis, dracula, type TimePoint } from '@wick-charts/svelte';

  let { data }: { data: TimePoint[] } = $props();
</script>

<ChartContainer theme={dracula.theme} style="width:100%;height:400px">
  <LineSeries
    data={{ color: '#00d4aa', data }}
    options={{ strokeWidth: 1, area: { visible: true }, pulse: true }}
  />
  <Tooltip />
  <Crosshair />
  <YAxis />
  <TimeAxis />
</ChartContainer>
```

### Multi-layer with stacking

```svelte
<ChartContainer style="width:100%;height:400px">
  <LineSeries
    data={[
      { label: 'Revenue', color: '#ff6b6b', data: revenue },
      { label: 'Costs', color: '#4ecdc4', data: costs },
      { label: 'Profit', color: '#45b7d1', data: profit },
    ]}
    options={{ strokeWidth: 1, area: { visible: true }, stacking: 'normal' }}
  />
  <Tooltip sort="desc" />
  <Legend position="bottom" mode="toggle" />
</ChartContainer>
```

## Typical overlay combinations

| Use case | Overlays |
|----------|----------|
| Simple line | `Tooltip`, `Crosshair`, `YAxis`, `TimeAxis` |
| Multi-layer | Add `Legend` with `position="bottom" mode="toggle"` |
| Dashboard sparkline-style | No overlays, `interactive={false}`, `grid={{ visible: false }}` |

## Custom tooltip: filter a subset of series

Wrap `Tooltip` with a render-prop to show only the series you care about — handy when the chart has five lines but the tooltip should read two:

```tsx
import { Tooltip } from '@wick-charts/react';

const FOCUS = new Set(['btc', 'eth']);

<Tooltip>
  {({ snapshots, time }) => (
    <div style={{ display: 'grid', gap: 4 }}>
      <small style={{ opacity: 0.6 }}>{new Date(time).toLocaleTimeString()}</small>
      {snapshots
        .filter((s) => FOCUS.has(s.seriesId))
        .map((s) => (
          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ color: s.color }}>{s.label ?? s.seriesId}</span>
            <span>{('value' in s.data ? s.data.value : 0).toFixed(2)}</span>
          </div>
        ))}
    </div>
  )}
</Tooltip>
```

Same pattern in Vue (`<Tooltip v-slot="{ snapshots, time }">`) and Svelte (`<Tooltip let:snapshots let:time>`). For a multi-layer series, filter by `seriesId` (shared identity) and use `id` as the row key.

## Common patterns

### Line without area (pure line chart)

```ts
options={{ area: { visible: false }, pulse: false }}
```

### Percentage stacked area

```ts
options={{
  area: { visible: true },
  stacking: 'percent',
}}
```

### Thin overlay indicator on a candlestick chart

```ts
<LineSeries
  data={{ label: 'SMA 20', color: '#ffd700', data: smaData }}
  options={{ strokeWidth: 1, area: { visible: false }, pulse: false }}
/>
```
