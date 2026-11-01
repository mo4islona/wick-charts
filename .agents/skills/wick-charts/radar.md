# Radar

`<RadarSeries>` compares a few series across the same axes on one shared scale, one filled polygon each: model or product comparisons, skill profiles, service health. It is a spatial series: no axes, no crosshair, no zoom. Options: `RadarSeriesOptions` in the installed types ([how to read them](SKILL.md#props-and-options-read-the-installed-types)).

```tsx
const axes = ['Reasoning', 'Coding', 'Math', 'Writing', 'Vision'];
const series = [
  { label: 'Atlas', data: [92, 88, 85, 79, 71] },
  { label: 'Nova', data: [78, 82, 70, 88, 84] },
];

<ChartContainer grid={{ visible: false }}>
  <RadarSeries axes={axes} data={series} options={{ max: 100 }} />
  <RadarTooltip />
  <Legend position="bottom" />
</ChartContainer>
```

```vue
<script setup lang="ts">
import { ChartContainer, Legend, type RadarLayer, RadarSeries, RadarTooltip } from '@wick-charts/vue';

defineProps<{ axes: string[]; series: RadarLayer[] }>();
</script>

<template>
  <ChartContainer :grid="{ visible: false }">
    <RadarSeries :axes="axes" :data="series" :options="{ max: 100 }" />
    <RadarTooltip />
    <Legend position="bottom" />
  </ChartContainer>
</template>
```

```svelte
<script lang="ts">
  import { ChartContainer, Legend, type RadarLayer, RadarSeries, RadarTooltip } from '@wick-charts/svelte';

  let { axes, series }: { axes: string[]; series: RadarLayer[] } = $props();
</script>

<ChartContainer grid={{ visible: false }}>
  <RadarSeries {axes} data={series} options={{ max: 100 }} />
  <RadarTooltip />
  <Legend position="bottom" />
</ChartContainer>
```

- **Data:** `axes` is the list of axis names, clockwise from `startAngle` (default 0, 12 o'clock). `data` is `{ label, data, color? }[]`, one layer per polygon, with one value per axis in the order of `axes`. `null` (or a non-finite number) is no reading: that vertex sits on the center and gets no dot. A row shorter or longer than `axes` warns once; the missing values draw as `null`. Imperative: `chart.setSeriesData(id, { axes, series })`.
- **Scale:** one shared scale from `min` (default 0) at the center to `max` at the outer ring. Without `max`, the radar picks a round number at or above the largest value, so each of the `rings` (default 4) gets a round value; set `max` when the values have a known ceiling (a score out of 100). Values outside clamp to the center or the rim. `ringLabels` writes the ring values along the first axis; `format` writes them and the hover values.
- **Web:** `gridShape: 'polygon'` (default) or `'circle'`. The axis names sit outside the web and never overlap it: the radius shrinks to make room, and a name wider than about a third of the chart is cut with `…`.
- **Hover and legend:** hovering a polygon (or near its outline) dims the others, lifts it with a glow (`glow`) and writes its value by each vertex (`hoverValues`); the ring values fade out meanwhile. Where polygons overlap, the smallest one under the pointer wins. `<RadarTooltip>` lists every axis value of the hovered polygon; its render-prop gets `info.rows` (`{ label, value, percent }`). `<Legend>` names its rows by the layers' `label`s and toggles a polygon, which collapses into the center.
- **Colors:** a layer's `color`, then `colors` (in layer order), then `theme.seriesColors`. `gridColor` (default `theme.grid.color`) and `labelColor` (default `theme.axis.textColor`) override the web and the text.
- **Live updates:** pass new arrays. Layers are matched by `label`: a kept one morphs to its new values over `updateMs` (default 500), a new one grows from the center and a dropped one collapses into it. New `axes` replay the entry. The first data draws the web in and plays `introAnimation` over `entryMs` (default 1100). The intro is a function, not a string: `radarGrowIntro()` (default: each polygon grows from the center), `radarScanIntro()` (a beam sweeps the polygons in), `radarSpinIntro()` (a quarter turn into place), `radarCascadeIntro()` (one polygon after another) or `radarInflateIntro()` (a regular shape at the mean, then the values). Create it once, outside a render. A custom one follows the exported `RadarIntroFn` type. Chart-level: `animations.series.radar` with `entry` / `update`, or `false`.
