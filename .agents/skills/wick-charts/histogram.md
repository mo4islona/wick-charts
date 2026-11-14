# Histogram

`<HistogramSeries>` draws the distribution of raw samples as contiguous bars on a numeric X axis: request latency, order sizes, returns. It bins the samples itself, or draws bins you counted. It needs `axis={{ x: { type: 'numeric' } }}`; on another X axis `addSeries` throws. Options: `HistogramSeriesOptions` in the installed types ([how to read them](SKILL.md#props-and-options-read-the-installed-types)).

```tsx
const NUMERIC = { x: { type: 'numeric' as const } };

<ChartContainer axis={NUMERIC}>
  <HistogramSeries data={latenciesMs} options={{ binWidth: 20, quantiles: [0.5, 0.95] }} />
  <Tooltip />
  <Crosshair />
  <YAxis />
  <XAxis />
</ChartContainer>
```

```vue
<script setup lang="ts">
import { ChartContainer, Crosshair, HistogramSeries, Tooltip, XAxis, YAxis } from '@wick-charts/vue';

defineProps<{ latenciesMs: number[] }>();
const NUMERIC = { x: { type: 'numeric' as const } };
</script>

<template>
  <ChartContainer :axis="NUMERIC">
    <HistogramSeries :data="latenciesMs" :options="{ binWidth: 20, quantiles: [0.5, 0.95] }" />
    <Tooltip />
    <Crosshair />
    <YAxis />
    <XAxis />
  </ChartContainer>
</template>
```

```svelte
<script lang="ts">
  import { ChartContainer, Crosshair, HistogramSeries, Tooltip, XAxis, YAxis } from '@wick-charts/svelte';

  let { latenciesMs }: { latenciesMs: number[] } = $props();
  const NUMERIC = { x: { type: 'numeric' as const } };
</script>

<ChartContainer axis={NUMERIC}>
  <HistogramSeries data={latenciesMs} options={{ binWidth: 20, quantiles: [0.5, 0.95] }} />
  <Tooltip />
  <Crosshair />
  <YAxis />
  <XAxis />
</ChartContainer>
```

- **Data:** raw samples `number[]`, or bins counted already `{ x0, x1, count }[]` (drawn as given, widths may differ). Several distributions overlay: pass an array of them, or named layers `{ label, color?, data }` for the legend and tooltip. Non-finite samples are skipped with a dev warning. Imperative: `chart.addSeries(HistogramSeriesDef, { layers })`, then `setSeriesData(id, samples, layer)`.
- **Binning:** `binWidth` fixes the width; else `bins` sets a target count; else Sturges' rule, `⌈log₂ n⌉ + 1` bins for the largest layer of `n` samples. The width rounds to 1, 2 or 5 × 10ⁿ, and edges sit on multiples of it (from `binOrigin`, default 0). Overlaid raw layers share one set of bins over their joint range, so they line up. Empty bins in the middle stay, at 0. `binSamples(samples, { bins, binWidth, binOrigin })` is the same binning as a plain function.
- **Bars and ticks:** bars run edge to edge with a `gap` (default 1 px). The X ticks land on bin edges whenever the bins have one width. The default fit shows every bin with half a bin of air at each side; a `padding` side you set wins.
- **`normalize`:** `'count'` (default), `'percent'` of the layer's samples, or `'density'` (count / (total × width), so the bars' area is 1). Use `'percent'` or `'density'` to compare layers of different sizes. A switch snaps the Y axis to the new units; the bars keep their height on screen.
- **Hover:** the `Tooltip` header is the bin range (`40 – 60`), and each row the bin's count and its share of the layer (`128 · 12.8%`), whatever `normalize` is. A snapshot's `data` is a `HistogramBinPoint` (`x0`, `x1`, `count`, `share`, `value` = bar height); `isHistogramBinPoint` tells it apart in a custom tooltip.
- **Quantiles:** `quantiles: [0.5, 0.95]` draws a dashed line per quantile and layer, with a `p50` / `p95` chip; `{ q, label?, color? }` sets the text and color. Exact for raw samples, interpolated inside the bin for pre-binned data.
- **Colors:** a layer's `color`, else `theme.seriesColors`. One layer fills opaque, overlaid layers at `fillOpacity` 0.55; set `fillOpacity` to change both.
- **Live updates:** pass a new array (or `push` in Vue / Svelte); the series re-bins and each bar eases to its new height over `smoothMs` (default 600), with the quantile lines. A new bin fades and grows in over `entryMs` (450), a dropped one shrinks away, and the view re-fits X. `chart.appendData(id, sample)` adds one sample; `chart.keepLast(id, n)` keeps a rolling window of the last `n` samples. Chart-level: `animations.series.histogram` with `entry` / `intro` / `smooth`, or `false`.
