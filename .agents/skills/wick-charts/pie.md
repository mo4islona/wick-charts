# Pie / Donut Chart

Categorical data chart with hover animations, radial gradients, automatic labels, and donut mode.

## Data format

```ts
interface PieSliceData {
  label: string;    // slice name (shown in tooltip/legend)
  value: number;    // slice size (absolute, not percentage)
  color?: string;   // optional override — falls back to theme palette
}
```

**Data prop is a flat array:** `PieSliceData[]` (not nested like Line/Bar).

```ts
data={[
  { label: 'Sales', value: 4000 },
  { label: 'Marketing', value: 3000 },
  { label: 'Operations', value: 2000 },
]}
```

## Series options

```ts
interface PieSeriesOptions {
  colors?: string[];         // palette — default: theme.seriesColors
  innerRadiusRatio: number;  // 0 = pie, 0.6 = donut — default: 0
  padAngle: number;          // gap between slices in radians — default: 0.02
  strokeColor: string;       // slice border color — default: 'transparent'
  strokeWidth: number;       // slice border width in px — default: 0
  label?: string;            // tooltip label
}
```

All options are optional — pass `Partial<PieSeriesOptions>`.

## Options explained

### `innerRadiusRatio`

Controls pie vs donut mode. Fraction of the outer radius used as inner hole.

| Value | Result |
|-------|--------|
| `0` | Full pie (default) |
| `0.4` | Thick donut |
| `0.6` | Standard donut |
| `0.85` | Thin ring |

### `colors`

Palette for slice coloring. Falls back to `theme.seriesColors` if not provided. Slices with an explicit `color` in data override the palette.

### `padAngle`

Gap between adjacent slices in radians. Default `0.02` gives a subtle separation. Set `0` for flush slices.

### `strokeColor` / `strokeWidth`

Border around each slice. Useful for visual separation on light backgrounds.

```ts
options={{ strokeColor: '#ffffff', strokeWidth: 2 }}
```

## Visual features

- **Hover animation:** slices explode outward with shadow blur (smooth exponential easing)
- **Radial gradient:** each slice has a subtle radial gradient for depth
- **Auto labels:** label text on slices, hidden when slice angle < 0.3 radians
- **Smart text color:** light/dark text auto-detected from slice background

## React

### Pie chart

```tsx
import { ChartContainer, PieSeries, PieTooltip, PieLegend } from '@wick-charts/react';
import type { PieSliceData } from '@wick-charts/react';
import { useState } from 'react';

function PieChart({ data }: { data: PieSliceData[] }) {
  const [seriesId, setSeriesId] = useState('');

  return (
    <ChartContainer style={{ width: 400, height: 400 }}>
      <PieSeries
        data={data}
        onSeriesId={setSeriesId}
      />
      {seriesId && <PieTooltip seriesId={seriesId} />}
      {seriesId && <PieLegend seriesId={seriesId} format="percent" />}
    </ChartContainer>
  );
}
```

### Donut chart

```tsx
<PieSeries
  data={data}
  options={{ innerRadiusRatio: 0.6 }}
  onSeriesId={setSeriesId}
/>
```

### Styled donut with borders

```tsx
<PieSeries
  data={data}
  options={{
    innerRadiusRatio: 0.6,
    padAngle: 0.03,
    strokeColor: '#1a1a2e',
    strokeWidth: 2,
    colors: ['#e94560', '#0f3460', '#16213e', '#533483'],
  }}
  onSeriesId={setSeriesId}
/>
```

### Props

```ts
interface PieSeriesProps {
  data: PieSliceData[];
  options?: Partial<PieSeriesOptions>;
  onSeriesId?: (id: string) => void;
}
```

## Vue

### Donut chart

```vue
<script setup lang="ts">
import { ChartContainer, PieSeries, PieTooltip, PieLegend } from '@wick-charts/vue';
import type { PieSliceData } from '@wick-charts/vue';
import { ref } from 'vue';

const seriesId = ref('');
const data: PieSliceData[] = [
  { label: 'Sales', value: 4000 },
  { label: 'Marketing', value: 3000 },
  { label: 'Operations', value: 2000 },
];
</script>

<template>
  <ChartContainer style="width: 400px; height: 400px">
    <PieSeries
      :data="data"
      :options="{ innerRadiusRatio: 0.6 }"
      @series-id="seriesId = $event"
    />
    <PieTooltip v-if="seriesId" :series-id="seriesId" />
    <PieLegend v-if="seriesId" :series-id="seriesId" format="value" />
  </ChartContainer>
</template>
```

### Props & Events

```ts
// Props
data: PieSliceData[]
options?: Partial<PieSeriesOptions>

// Emits
@series-id(id: string)
```

## Svelte

### Donut chart

```svelte
<script>
  import { ChartContainer, PieSeries, PieTooltip, PieLegend } from '@wick-charts/svelte';

  let seriesId = '';
  const data = [
    { label: 'Sales', value: 4000 },
    { label: 'Marketing', value: 3000 },
    { label: 'Operations', value: 2000 },
  ];
</script>

<ChartContainer style="width:400px;height:400px">
  <PieSeries
    {data}
    options={{ innerRadiusRatio: 0.6 }}
    onSeriesId={(id) => seriesId = id}
  />
  {#if seriesId}
    <PieTooltip {seriesId} />
    <PieLegend {seriesId} format="value" />
  {/if}
</ChartContainer>
```

### Props

```ts
data: PieSliceData[]
options?: Partial<PieSeriesOptions>
onSeriesId?: (id: string) => void
```

## Pie-specific overlays

| Component | Props | Description |
|-----------|-------|-------------|
| `PieTooltip` | `seriesId` | Shows slice label, value, and percentage on hover |
| `PieLegend` | `seriesId`, `format?: 'value' \| 'percent'` | Slice labels with values or percentages |

**Do not use** `Tooltip`, `Crosshair`, `YAxis`, `TimeAxis`, or `YLabel` with pie charts — they are for time-based series only.

## Common patterns

### Full pie (no hole)

```ts
options={{ innerRadiusRatio: 0 }}  // default
```

### Thin ring donut

```ts
options={{ innerRadiusRatio: 0.85, padAngle: 0.04 }}
```

### Custom slice colors in data

```ts
data={[
  { label: 'Success', value: 85, color: '#10b981' },
  { label: 'Warning', value: 10, color: '#f59e0b' },
  { label: 'Error', value: 5, color: '#ef4444' },
]}
// No need for options.colors — data colors take priority
```

### Donut with center content

The chart renders on canvas, so center content must be positioned via CSS:

```tsx
<div style={{ position: 'relative', width: 400, height: 400 }}>
  <ChartContainer style={{ width: '100%', height: '100%' }}>
    <PieSeries data={data} options={{ innerRadiusRatio: 0.65 }} onSeriesId={setId} />
    {id && <PieTooltip seriesId={id} />}
  </ChartContainer>
  <div style={{
    position: 'absolute', top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)', textAlign: 'center',
  }}>
    <div style={{ fontSize: 24, fontWeight: 'bold' }}>$9,000</div>
    <div style={{ fontSize: 12, opacity: 0.6 }}>Total</div>
  </div>
</div>
```
