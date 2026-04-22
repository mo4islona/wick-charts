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
  padAngle: number;          // gap between slices in degrees — default: 1.15°
  label?: string;            // tooltip label
  sliceLabels?: PieLabelsOptions; // per-slice on-pie labels — see below
  animate?: boolean;         // label draw-in + hover explode — default: false
}

interface PieLabelsOptions {
  mode?: 'inside' | 'outside' | 'none'; // default: 'outside'
  content?: 'percent' | 'label' | 'both'; // default: 'both'
  fontSize?: number;        // CSS px — default: 11
  minSliceAngle?: number;   // degrees; slices narrower than this skip label — default: 2.5°
  elbowLen?: number;        // leader-line radial segment length in CSS px — default: 12
  legPad?: number;          // gap between leader line and text in CSS px — default: 6
  distance?: number;        // radial px from pie edge to label anchor — default: 24
  labelGap?: number;        // vertical gap between outside labels as fontSize multiplier — default: 1.4
  balanceSides?: boolean;   // @deprecated — no effect in radial per-slice layout
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

Gap between adjacent slices in degrees. Default `1.15°` (≈ 0.02 rad) gives a subtle separation. Set `0` for flush slices.

### `animate`

Motion toggle. When `true`, labels draw in on mount / data swap and the hovered slice explodes outward. Default `false` — both effects are skipped and the chart paints in its final state on the first frame. Enable for presentations; keep off for dense dashboards.

### `sliceLabels`

Controls the per-slice labels drawn on the pie. Omit for the default outside layout, or pass `{ mode: 'none' }` to turn off labels entirely and rely on `PieLegend` / `PieTooltip` alone.

```ts
// Outside labels (default) — leader line out to text block
options={{ sliceLabels: { mode: 'outside', content: 'both' } }}

// Inside labels — text on the slice; auto-skipped when the label doesn't fit
options={{ sliceLabels: { mode: 'inside', content: 'percent', fontSize: 12 } }}

// No on-pie labels; use PieLegend instead
options={{ sliceLabels: { mode: 'none' } }}
```

Tuning outside-label crowding:
- `minSliceAngle` (default `2.5°`) — raise to drop tiny slices from the layout pass
- `labelGap` (default `1.4`) — vertical min-gap between same-side labels as a multiplier of `fontSize`
- `elbowLen` / `legPad` — leader-line geometry
- `balanceSides` (default `true`) — redistributes labels near 12/6 o'clock to the less-crowded side

## Visual features

- **Hover animation:** slices explode outward with shadow blur (smooth exponential easing)
- **Radial gradient:** each slice has a subtle radial gradient for depth
- **On-pie labels:** configurable via `sliceLabels` (outside / inside / none)
- **Smart text color:** light/dark text auto-detected from slice background

## React

### Pie chart

```tsx
import { ChartContainer, PieSeries, PieTooltip, PieLegend } from '@wick-charts/react';
import type { PieSliceData } from '@wick-charts/react';

function PieChart({ data }: { data: PieSliceData[] }) {
  return (
    <ChartContainer style={{ width: 400, height: 400 }}>
      <PieSeries data={data} />
      <PieTooltip />
      <PieLegend mode="percent" />
    </ChartContainer>
  );
}
```

`seriesId` is optional on `PieTooltip` / `PieLegend` — with a single `PieSeries`, the overlays auto-pick it. Pass `seriesId` only when multiple pie series coexist.

### Donut chart

```tsx
<PieSeries
  data={data}
  options={{ innerRadiusRatio: 0.6 }}
/>
```

### Styled donut with borders

```tsx
<PieSeries
  data={data}
  options={{
    innerRadiusRatio: 0.6,
    padAngle: 0.03,
    stroke: { color: '#1a1a2e', width: 2 },
    colors: ['#e94560', '#0f3460', '#16213e', '#533483'],
  }}
/>
```

### Props

```ts
interface PieSeriesProps {
  data: PieSliceData[];
  options?: Partial<PieSeriesOptions>;
  /** Stable series ID — reuse across overlays that target this series. */
  id?: string;
}
```

## Vue

### Donut chart

```vue
<script setup lang="ts">
import { ChartContainer, PieSeries, PieTooltip, PieLegend } from '@wick-charts/vue';
import type { PieSliceData } from '@wick-charts/vue';

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
    />
    <PieTooltip />
    <PieLegend mode="value" />
  </ChartContainer>
</template>
```

### Props

```ts
data: PieSliceData[]
options?: Partial<PieSeriesOptions>
/** Stable series ID — reuse across overlays that target this series. */
id?: string
```

## Svelte

### Donut chart

```svelte
<script>
  import { ChartContainer, PieSeries, PieTooltip, PieLegend } from '@wick-charts/svelte';

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
  />
  <PieTooltip />
  <PieLegend mode="value" />
</ChartContainer>
```

### Props

```ts
data: PieSliceData[]
options?: Partial<PieSeriesOptions>
/** Stable series ID — reuse across overlays that target this series. */
id?: string
```

## Pie-specific overlays

| Component | Props | Slot ctx | Description |
|-----------|-------|----------|-------------|
| `PieTooltip` | `seriesId?`, `format?` | `{ info, format }` | Shows slice label, value, and percentage on hover |
| `PieLegend` | `seriesId?`, `mode?: 'value' \| 'percent'`, `format?: (v) => string` | `{ slices, mode, format }` | Slice labels with values or percentages |

`seriesId` is optional on both — omit on a single-pie chart and the first visible pie series is picked automatically.

**Do not use** `Tooltip`, `Crosshair`, `YAxis`, `TimeAxis`, or `YLabel` with pie charts — they are for time-based series only.

### Custom PieTooltip / PieLegend

```tsx
import { PieTooltip, PieLegend } from '@wick-charts/react';

<PieTooltip>
  {({ info, format }) => (
    <div style={{ display: 'grid', gap: 2 }}>
      <strong>{info.label}</strong>
      <span>{format(info.value)} · {(info.percent * 100).toFixed(1)}%</span>
    </div>
  )}
</PieTooltip>

<PieLegend>
  {({ slices, mode, format }) => (
    <ul style={{ listStyle: 'none', padding: 0 }}>
      {slices.map((s, i) => (
        <li key={s.label} style={{ color: s.color }}>
          {s.label}: {mode === 'percent' ? `${(s.percent * 100).toFixed(1)}%` : format(s.value)}
        </li>
      ))}
    </ul>
  )}
</PieLegend>
```

Same shapes in Vue (`v-slot="{ info, format }"` / `v-slot="{ slices, mode, format }"`) and Svelte (`let:info let:format` / `let:slices let:mode let:format`). `PieTooltip`'s floating container (flip + clamp) stays — only its contents change.

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
    <PieSeries data={data} options={{ innerRadiusRatio: 0.65 }} />
    <PieTooltip />
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
