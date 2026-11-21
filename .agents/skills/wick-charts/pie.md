# Pie / donut chart

`<PieSeries>` draws slices of a whole, as a pie or a donut, with labels on the pie and small slices grouped into "Other". It is a spatial series: use `PieTooltip`, `PieLegend` and `PieCenter`, not `Tooltip`, `Crosshair`, `YAxis`, `TimeAxis` or `YLabel`. Every option with its default: `PieSeriesOptions` in the installed types ([how to read them](SKILL.md#props-and-options-read-the-installed-types)), or <https://wick-charts.eeff.io/api/pie-series/>.

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

`PieCenter` (from 0.9.4) puts the total in the hole of a donut, and the hovered slice while the pointer is on one. The chart places and sizes it, so it stays in the hole when a legend or outside labels move the disk. It renders nothing on a pie without a hole (`innerRadiusRatio: 0`).

```tsx
<ChartContainer>
  <PieSeries data={data} options={{ innerRadiusRatio: 0.65 }} />
  <PieCenter label="Total sessions" format={(v) => v.toLocaleString()} />
  <PieLegend position="bottom" />
</ChartContainer>
```

- `followHover={false}` keeps the total while the pointer is on a slice. With the default, the center already shows the hovered slice, so a `PieTooltip` next to it repeats the same data: keep one of the two.
- Custom content: a render-prop in React, `v-slot="{ total, slices, hovered, format, hole }"` in Vue, `let:total let:hovered` in Svelte. The context has the total, the slices, the hovered slice or `null`, the formatter and the hole geometry (`hole.innerRadius` in CSS pixels).

```tsx
<PieCenter>
  {({ total, hovered, format }) => <strong>{format(hovered ? hovered.value : total)}</strong>}
</PieCenter>
```

Before 0.9.4, put an absolutely positioned element over the chart, centered on the plot. It drifts off the hole when a `PieLegend` or outside labels take space.
