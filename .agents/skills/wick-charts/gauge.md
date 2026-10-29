# Gauge and radial progress

`<GaugeSeries>` shows one value against a range on an arc: CPU load, a score, a quota. `<RadialProgressSeries>` shows a few related values against the same limit as concentric rings. Both are spatial series: no axes, no crosshair, no zoom, no hover. Options: `GaugeSeriesOptions` and `RadialProgressSeriesOptions` in the installed types ([how to read them](SKILL.md#props-and-options-read-the-installed-types)).

```tsx
<ChartContainer grid={{ visible: false }}>
  <GaugeSeries
    value={cpuLoad}
    options={{
      label: 'CPU load',
      format: (v) => `${v}%`,
      zones: [{ to: 60 }, { to: 85 }, { to: 100 }],
    }}
  />
</ChartContainer>

<ChartContainer grid={{ visible: false }}>
  <RadialProgressSeries
    data={[
      { label: 'CPU', value: 72 },
      { label: 'Memory', value: 54 },
      { label: 'Disk', value: 31 },
    ]}
  />
  <PieLegend position="right" mode="percent" />
</ChartContainer>
```

```vue
<script setup lang="ts">
import { ChartContainer, GaugeSeries, type GaugeSeriesOptions, PieLegend, type PieSliceInput, RadialProgressSeries } from '@wick-charts/vue';

defineProps<{ cpuLoad: number; usage: PieSliceInput[] }>();

const options: Partial<GaugeSeriesOptions> = {
  label: 'CPU load',
  format: (v) => `${v}%`,
  zones: [{ to: 60 }, { to: 85 }, { to: 100 }],
};
</script>

<template>
  <ChartContainer :grid="{ visible: false }">
    <GaugeSeries :value="cpuLoad" :options="options" />
  </ChartContainer>

  <ChartContainer :grid="{ visible: false }">
    <RadialProgressSeries :data="usage" />
    <PieLegend position="right" mode="percent" />
  </ChartContainer>
</template>
```

```svelte
<script lang="ts">
  import { ChartContainer, GaugeSeries, type GaugeSeriesOptions, PieLegend, type PieSliceInput, RadialProgressSeries } from '@wick-charts/svelte';

  let { cpuLoad, usage }: { cpuLoad: number; usage: PieSliceInput[] } = $props();

  const options: Partial<GaugeSeriesOptions> = {
    label: 'CPU load',
    format: (v) => `${v}%`,
    zones: [{ to: 60 }, { to: 85 }, { to: 100 }],
  };
</script>

<ChartContainer grid={{ visible: false }}>
  <GaugeSeries value={cpuLoad} {options} />
</ChartContainer>

<ChartContainer grid={{ visible: false }}>
  <RadialProgressSeries data={usage} />
  <PieLegend position="right" mode="percent" />
</ChartContainer>
```

- **Gauge data:** one number in `value`, not `data`. Imperative: `chart.setSeriesData(id, 72)`. A value outside `min`…`max` (default 0…100) clamps on the arc; the center label shows the real value.
- **Arc:** `startAngle` / `endAngle` are degrees clockwise from 12 o'clock (default -120 / 120). `style: 'needle'` points a needle at the value instead of filling the arc; the label moves where the needle never crosses it: under the hub, over it when the arc runs along the bottom, or under the dial when the needle can point both up and down. A label too long for its place even at 8 px is left out.
- **Zones:** `{ to, color? }[]`, each from the previous `to` (or `min`). The value arc or needle takes the color of the zone the value ends in, and `color` between the last `to` and `max`. The value is clamped to `min`…`max` first, so a value over `max` takes the color at the arc end: the last zone's when the zones reach `max`. `zoneColor: 'morph'` makes that color follow the moving arc and blend into the next zone near each border; the default `'target'` keeps the target's zone color through the entrance. Zones without a color sample the theme's good → bad ramp (`theme.gauge.zoneColors`).
- **Labels:** `format` writes the center value and the `min` / `max` labels in the arc's gap next to its ends (`rangeLabels: false` hides those; a gap under 60° drops them); `label` is the caption under the value. There are no ticks along the arc.
- **Radial progress data:** `{ label, value, color? }[]`, the pie slice shape: one ring per item, outermost first, each filled to `value / max` (`max` default 100). The rings share the radius, so each gets thinner as items are added: keep it to a few values, and use a bar chart past about 10. `<PieLegend>` without `seriesId` finds a radial progress series when the chart has no pie, and its percent is the share of `max`.
- **Radial progress look:** `startAngle` / `endAngle` set the arc of every ring (`-90` / `90` is a half "rainbow", `0` / `270` leaves a gap). The other parts are plain functions from the package, not strings: `layout` places the rings (`ringsLayout()` default, `heroLayout()` makes the first ring thick and the rest thin), `painter` draws each ring (`solidRing()` default, `tickRing({ count, animation })` draws watch-face ticks that come and go with `popTicks()`, `radarTicks()` or `flyTicks()`), and `labels` draws the text: `heroCenter()` (the first value large in the middle), `listCenter()` (every value in the middle), `startLabels()` (before each ring start, needs a gap) or `headTags()` (a pill at each ring head). Each one draws only the text that fits: extra rows and items become `+N`, labels on rings too close for 8 px text and tags that would cover another tag are left out. For two kinds of text, pass one function that calls both. A custom function follows the exported types `RadialLayout`, `RingPainter` and `RadialLabelPainter`.
- **Colors:** `trackColor` on both (default `theme.gauge.trackColor`), `color` on a gauge, `colors` (in data order) or an item's `color` on the rings.
- **Live updates:** pass a new value or array. The arc glides from the value on screen over `updateMs` (default 500), so a value that arrives mid-glide carries on from there. The first data sweeps up from `min` (each ring from 0) over `entryMs` (default 900). Chart-level: `animations.series.gauge` / `animations.series.radialProgress` with `entry` / `update`, or `false`.
