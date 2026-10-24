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

## Options

Every option with its default and doc comment: `PieSeriesOptions` in the installed types ([how to read them](SKILL.md#props-and-options-read-the-installed-types)), or <https://wick-charts.eeff.io/api/pie-series/>. The sections below cover what a type can't show.

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

### `animate`

Motion toggle. When `true`, labels draw in on mount / data swap and the hovered slice explodes outward. Default `false` — both effects are skipped and the chart paints in its final state on the first frame. Enable for presentations; keep off for dense dashboards.

### `gradient`

Each slice is painted with a radial *depth* gradient — a subtle lightening from the slice center toward its edge for a soft 3D sheen. **On by default.** Set `false` for flat, solid-color slices (the material / infographic look).

```ts
// Flat, solid-color slices
options={{ gradient: false }}
```

### `other` — small-slice grouping

**On by default.** When the data has more than `maxSlices` entries (default 8), the largest `maxSlices - 1` slices keep their original order and the rest are summed into a single synthetic "Other" slice appended at the end. The aggregate behaves like a regular slice everywhere — labels, legend, tooltip, hover, hit-testing — and is painted with the theme's muted `pie.otherColor` so it doesn't compete with real categories.

```ts
// Default: top 7 + "Other" when data exceeds 8 slices
<PieSeries data={data} />

// Show every slice, no grouping
options={{ other: false }}

// Tighter grouping with a custom label
options={{ other: { maxSlices: 5, label: 'Rest' } }}
```

Ranking uses sanitized values — negative / non-finite entries never outrank a real slice.

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

Crowded outside labels: raise `minSliceAngle` to drop the tiniest slices from the layout, or `labelGap` to spread same-side labels (`PieLabelsOptions`).

## Visual features

- **Hover animation:** slices explode outward with shadow blur (smooth exponential easing)
- **Radial gradient:** each slice has a subtle radial depth gradient (disable with `gradient: false` for flat slices)
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

### Styled donut

```tsx
<PieSeries
  data={data}
  options={{
    innerRadiusRatio: 0.6,
    padAngle: 2, // degrees
    cornerRadius: 4,
    colors: ['#e94560', '#0f3460', '#16213e', '#533483'],
  }}
/>
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

## Svelte

### Donut chart

```svelte
<script lang="ts">
  import { ChartContainer, PieSeries, PieTooltip, PieLegend, type PieSliceData } from '@wick-charts/svelte';

  const data: PieSliceData[] = [
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

## Pie-specific overlays

| Component | Slot ctx | Description |
|-----------|----------|-------------|
| `PieTooltip` | `{ info, format }` | Shows slice label, value, and percentage on hover |
| `PieLegend` | `{ slices, mode, format }` | Slice labels with values (`mode="value"`) or percentages (`mode="percent"`) |

`seriesId` is optional on both — omit on a single-pie chart and the first visible pie series is picked automatically.

**Do not use** `Tooltip`, `Crosshair`, `YAxis`, `TimeAxis`, or `YLabel` with pie charts — they are for time-based series only.

### Custom PieTooltip / PieLegend

```tsx
import { PieTooltip, PieLegend } from '@wick-charts/react';

<PieTooltip>
  {({ info, format }) => (
    <div style={{ display: 'grid', gap: 2 }}>
      <strong>{info.label}</strong>
      <span>{format(info.value)} · {info.percent.toFixed(1)}%</span>
    </div>
  )}
</PieTooltip>

<PieLegend>
  {({ slices, mode, format }) => (
    <ul style={{ listStyle: 'none', padding: 0 }}>
      {slices.map((s) => (
        <li key={s.label} style={{ color: s.color }}>
          {s.label}: {mode === 'percent' ? `${s.percent.toFixed(1)}%` : format(s.value)}
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
options={{ innerRadiusRatio: 0.85, padAngle: 2 }}
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
