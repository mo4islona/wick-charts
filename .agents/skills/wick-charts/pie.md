# Pie / donut chart

`<PieSeries>` draws slices of a whole, as a pie or a donut, with labels on the pie and small slices grouped into "Other". It is a spatial series: use `PieTooltip` and `PieLegend`, not `Tooltip`, `Crosshair`, `YAxis`, `TimeAxis` or `YLabel`. Every option with its default: `PieSeriesOptions` in the installed types ([how to read them](SKILL.md#props-and-options-read-the-installed-types)), or <https://wick-charts.eeff.io/api/pie-series/>.

## Data

A flat array, not layers:

```ts
data={[
  { label: 'Sales', value: 4000 },
  { label: 'Marketing', value: 3000 },
  { label: 'Operations', value: 2000, color: '#f59e0b' }, // a color overrides the palette
]}
```

`value` is an absolute amount, not a percent. Colors come from `options.colors`, else `theme.seriesColors`; a slice `color` wins over both.

## Options with a trap

- **`innerRadiusRatio`** makes a donut: the hole as a fraction of the radius. `0` is a pie (default), `0.6` a usual donut, `0.85` a thin ring.
- **`other`** is on by default: with more than `maxSlices` slices (default 8), the largest `maxSlices - 1` keep their order and the rest sum into one "Other" slice at the end, in the theme's muted `pie.otherColor`. It acts as a normal slice in the labels, the legend and the tooltip. `other: false` shows every slice; `other: { maxSlices: 5, label: 'Rest' }` tunes it.
- **`animate`** is off by default: the chart paints in its final state and a hovered slice stays in place. `animate: true` draws the labels in and moves a hovered slice outward.
- **`sliceLabels`:** `{ mode: 'outside' }` (default, with leader lines), `'inside'` (on the slice, skipped where the text does not fit) or `'none'` (use `PieLegend` / `PieTooltip` instead); `content: 'percent' | 'label' | 'both'`. Crowded outside labels: raise `sliceLabels.minSliceAngle` to leave out the labels of the smallest slices, or `sliceLabels.labelGap` to spread them.
- **`gradient`** (on by default) gives each slice a soft radial shade; `gradient: false` paints flat slices.
- **`padAngle`** is the gap between slices in degrees; **`cornerRadius`** rounds the slice corners.

## React

```tsx
import { ChartContainer, type PieSliceData, PieLegend, PieSeries, PieTooltip } from '@wick-charts/react';

export function Spend({ data }: { data: PieSliceData[] }) {
  return (
    <ChartContainer style={{ width: 400, height: 400 }}>
      <PieSeries data={data} options={{ innerRadiusRatio: 0.6, padAngle: 2 }} />
      <PieTooltip />
      <PieLegend mode="percent" />
    </ChartContainer>
  );
}
```

## Vue

```vue
<script setup lang="ts">
import { ChartContainer, type PieSliceData, PieLegend, PieSeries, PieTooltip } from '@wick-charts/vue';

defineProps<{ data: PieSliceData[] }>();
</script>

<template>
  <ChartContainer style="width: 400px; height: 400px">
    <PieSeries :data="data" :options="{ innerRadiusRatio: 0.6 }" />
    <PieTooltip />
    <PieLegend mode="value" />
  </ChartContainer>
</template>
```

## Svelte

```svelte
<script lang="ts">
  import { ChartContainer, type PieSliceData, PieLegend, PieSeries, PieTooltip } from '@wick-charts/svelte';

  let { data }: { data: PieSliceData[] } = $props();
</script>

<ChartContainer style="width:400px;height:400px">
  <PieSeries {data} options={{ innerRadiusRatio: 0.6 }} />
  <PieTooltip />
  <PieLegend mode="value" />
</ChartContainer>
```

## Tooltip and legend

`PieTooltip` shows the slice label, value and percent on hover. `PieLegend` lists the slices: `mode="value" | "percent" | "both"` (default `'both'`), `position="bottom" | "right" | "overlay"`. Both find the pie by themselves; pass `seriesId` only when the chart has several pies.

```tsx
<PieTooltip>
  {({ info, format }) => (
    <div style={{ display: 'grid', gap: 2 }}>
      <strong>{info.label}</strong>
      <span>{format(info.value)} · {info.percent.toFixed(1)}%</span>
    </div>
  )}
</PieTooltip>

<PieLegend>
  {({ slices, format }) => (
    <ul style={{ listStyle: 'none', padding: 0 }}>
      {slices.map((s) => (
        <li key={s.label} style={{ color: s.color }}>
          {s.label}: {format(s.value)} ({s.percent.toFixed(1)}%)
        </li>
      ))}
    </ul>
  )}
</PieLegend>
```

Vue and Svelte take the same context: `v-slot="{ info, format }"`, `let:info let:format`.

## Content in the donut hole

The chart draws on a canvas, so put the center text in an element over it:

```tsx
<div style={{ position: 'relative', width: 400, height: 400 }}>
  <ChartContainer style={{ width: '100%', height: '100%' }}>
    <PieSeries data={data} options={{ innerRadiusRatio: 0.65 }} />
    <PieTooltip />
  </ChartContainer>
  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
    <div style={{ fontSize: 24, fontWeight: 'bold' }}>$9,000</div>
    <div style={{ fontSize: 12, opacity: 0.6 }}>Total</div>
  </div>
</div>
```
