# Line / Area Chart

Time-series line chart with area gradient fill, multi-layer support, stacking modes, and animated pulsing dot.

## Data format

```ts
interface TimePoint {
  time: number;   // timestamp in milliseconds (Date.now() style)
  value: number;
}

// Also accepts Date objects for time:
type TimePointInput = Omit<TimePoint, 'time'> & { time: number | Date };
```

**Data prop is always `TimePoint[][]`** — an array of layers.

```ts
// Single line — wrap in array
data={[myData]}

// Multi-layer
data={[layer1, layer2, layer3]}
```

> `LineData` is a deprecated alias for `TimePoint`. Use `TimePoint`.

## Series options

```ts
interface LineSeriesOptions {
  label?: string;                          // tooltip display name
  colors: string[];                        // one color per layer — default: ['#2962FF']
  lineWidth: number;                       // stroke width in px — default: 1
  areaFill: boolean;                       // gradient area under line — default: true
  pulse: boolean;                          // animated dot at last point — default: true
  stacking: 'off' | 'normal' | 'percent'; // layer stacking — default: 'off'
}
```

All options are optional — pass `Partial<LineSeriesOptions>`.

## Options explained

### `colors`

One hex color per layer. If fewer colors than layers, layers cycle through the palette.

```ts
// Single line
options={{ colors: ['#00d4aa'] }}

// Three layers
options={{ colors: ['#ff6b6b', '#4ecdc4', '#45b7d1'] }}
```

### `lineWidth`

Stroke width in CSS pixels (scaled by device pixel ratio internally, min 1). Defaults to `1`. Same value applied to every layer.

```ts
options={{ lineWidth: 2 }}
```

### `areaFill`

When `true`, a vertical gradient fills the area below each line:
- Top: line color at 12% opacity
- Bottom: line color at 1% opacity

Works with stacking — each layer fills down to the layer below it.

### `pulse`

Animated pulsing dot at the last data point. Useful for live data. Set `false` for historical/static charts.

### `stacking`

| Mode | Behavior |
|------|----------|
| `'off'` | Each layer rendered independently, overlapping |
| `'normal'` | Layers stack cumulatively — each layer's Y = sum of all layers below |
| `'percent'` | Like `'normal'` but normalized to 0–100% of total |

## Performance

Automatic decimation kicks in when visible data points exceed 2x pixel width. Data is reduced to 1.5x pixels while preserving min/max extremes.

## React

### Single line with area fill

```tsx
import { ChartContainer, LineSeries, Tooltip, Crosshair, YAxis, TimeAxis, dracula } from '@wick-charts/react';
import type { TimePoint } from '@wick-charts/react';

function LineChart({ data }: { data: TimePoint[] }) {
  return (
    <ChartContainer theme={dracula} style={{ width: '100%', height: 400 }}>
      <LineSeries
        data={[data]}
        options={{ colors: ['#00d4aa'], lineWidth: 1, areaFill: true, pulse: true }}
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
    data={[revenue, costs, profit]}
    options={{
      colors: ['#ff6b6b', '#4ecdc4', '#45b7d1'],
      lineWidth: 1,
      areaFill: true,
      stacking: 'normal',
    }}
    label="Revenue"
  />
  <Tooltip sort="desc" />
  <Legend position="bottom" mode="toggle" />
</ChartContainer>
```

### Props

```ts
interface LineSeriesProps {
  data: TimePoint[][];                       // array of layers
  options?: Partial<LineSeriesOptions>;
  label?: string;
  /** Stable series ID — reuse across overlays that target this series. */
  id?: string;
}
```

## Vue

### Single line

```vue
<script setup lang="ts">
import { ChartContainer, LineSeries, Tooltip, Crosshair, Legend, YAxis, TimeAxis, dracula } from '@wick-charts/vue';
import type { TimePoint } from '@wick-charts/vue';

const props = defineProps<{ data: TimePoint[] }>();
</script>

<template>
  <ChartContainer :theme="dracula" style="width: 100%; height: 400px">
    <LineSeries
      :data="[props.data]"
      :options="{ colors: ['#00d4aa'], lineWidth: 1, areaFill: true, pulse: true }"
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
      :data="[revenue, costs, profit]"
      :options="{
        colors: ['#ff6b6b', '#4ecdc4', '#45b7d1'],
        lineWidth: 1,
        areaFill: true,
        stacking: 'normal',
      }"
      label="Revenue"
    />
    <Tooltip sort="desc" />
    <Legend position="bottom" mode="toggle" />
  </ChartContainer>
</template>
```

### Props & Events

```ts
// Props
data: TimePoint[][]
options?: Partial<LineSeriesOptions>
label?: string
/** Stable series ID — reuse across overlays that target this series. */
id?: string
```

## Svelte

### Single line

```svelte
<script>
  import { ChartContainer, LineSeries, Tooltip, Crosshair, Legend, YAxis, TimeAxis, dracula } from '@wick-charts/svelte';
  export let data = [];
</script>

<ChartContainer theme={dracula} style="width:100%;height:400px">
  <LineSeries
    data={[data]}
    options={{ colors: ['#00d4aa'], lineWidth: 1, areaFill: true, pulse: true }}
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
    data={[revenue, costs, profit]}
    options={{
      colors: ['#ff6b6b', '#4ecdc4', '#45b7d1'],
      lineWidth: 1,
      areaFill: true,
      stacking: 'normal',
    }}
    label="Revenue"
  />
  <Tooltip sort="desc" />
  <Legend position="bottom" mode="toggle" />
</ChartContainer>
```

### Props

```ts
data: TimePoint[][]
options?: Partial<LineSeriesOptions>
label?: string
/** Stable series ID — reuse across overlays that target this series. */
id?: string
```

## Typical overlay combinations

| Use case | Overlays |
|----------|----------|
| Simple line | `Tooltip`, `Crosshair`, `YAxis`, `TimeAxis` |
| Multi-layer | Add `Legend` with `position="bottom" mode="toggle"` |
| Dashboard sparkline-style | No overlays, `interactive={false}`, `grid={false}` |

## Common patterns

### Line without area (pure line chart)

```ts
options={{ areaFill: false, pulse: false }}
```

### Percentage stacked area

```ts
options={{
  colors: ['#ff6b6b', '#4ecdc4', '#45b7d1'],
  areaFill: true,
  stacking: 'percent',
}}
```

### Thin overlay indicator on a candlestick chart

```ts
<LineSeries
  data={[smaData]}
  options={{ colors: ['#ffd700'], lineWidth: 1, areaFill: false, pulse: false }}
  label="SMA 20"
/>
```
