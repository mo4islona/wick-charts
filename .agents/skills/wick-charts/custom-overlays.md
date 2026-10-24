# Your own components inside a chart

`<ChartContainer>` provides two contexts to its children: the chart (the `ChartInstance`, the imperative API) and the theme (the current `ChartTheme`). The built-in overlays use them, and so can your components. To change only the content of a built-in tooltip, legend or badge, use its slot instead: [overlays.md](overlays.md#custom-content).

## Read the chart and the theme

**React.** `useChartInstance()` returns the `ChartInstance` and throws outside `<ChartContainer>`. `useTheme()` returns the `ChartTheme`; `useThemeOptional()` returns `null` outside a theme provider.

```tsx
import { ChartContainer, CandlestickSeries, useChartInstance, useTheme } from '@wick-charts/react';

function FitButton() {
  const chart = useChartInstance();
  const theme = useTheme();

  return (
    <button onClick={() => chart.fitContent()} style={{ color: theme.axis.textColor }}>
      Fit
    </button>
  );
}

<ChartContainer>
  <CandlestickSeries data={ohlc} />
  <FitButton />
</ChartContainer>
```

**Vue.** `useChartInstance()` returns the instance; `useTheme()` returns a `ShallowRef<ChartTheme>`. Both throw outside `<ChartContainer>`.

```vue
<script setup lang="ts">
import { useChartInstance, useTheme } from '@wick-charts/vue';

const chart = useChartInstance();
const theme = useTheme();
</script>

<template>
  <button @click="chart.fitContent()" :style="{ color: theme.axis.textColor }">Fit</button>
</template>
```

**Svelte.** `getChartContext()` returns a `Readable<ChartInstance | null>` and `getThemeContext()` a `Readable<ChartTheme>`. Children of `ChartContainer` render only once the chart exists, so `get()` gives the instance:

```svelte
<script lang="ts">
  import { createLastYValue, getChartContext, getThemeContext } from '@wick-charts/svelte';
  import { get } from 'svelte/store';

  let { seriesId }: { seriesId: string } = $props();

  const chart = get(getChartContext());
  const theme = getThemeContext();
  const last = $derived(chart ? createLastYValue(chart, seriesId) : null);
</script>

{#if $last}
  <span style="color: {$theme.axis.textColor}">{$last.value.toFixed(2)}</span>
{/if}
```

## Reactive reads

These subscribe to the right chart events and update by themselves. React returns plain values, Vue refs, Svelte `Readable` stores.

| React hook / Vue composable | Svelte store | Value |
|---|---|---|
| `useVisibleRange(chart)` | `createVisibleRange(chart)` | `{ from, to }` |
| `useYRange(chart)` | `createYRange(chart)` | `{ min, max }` |
| `useLastYValue(chart, seriesId)` | `createLastYValue(chart, seriesId)` | `{ value, isLive } \| null` |
| `usePreviousClose(chart, seriesId)` | `createPreviousClose(chart, seriesId)` | `number \| null` |
| `useCrosshairPosition(chart)` | `createCrosshairPosition(chart)` | `{ mediaX, mediaY, time, x, y } \| null` |

## The chart instance

A selection of the methods a custom child needs. Every method and its doc comment: `ChartInstance` in the installed types ([how to read them](SKILL.md#props-and-options-read-the-installed-types)).

- `fitContent()` fits the view to all data.
- `getVisibleRange()`, `getYRange()`, `getCrosshairPosition()` read the current state once.
- `getLastValue(id)` → `{ value, isLive } | null`, `getPreviousClose(id)`, `getLastData(id)`, `getDataAtTime(id, time)` read the data.
- `getStackedLastValue(id)` gives the top of a stacked series (or the last value when it is not stacked). Anchor a badge at the drawn stack top with it.
- `getLayerLastSnapshots(id)` gives the last point of each layer, each at its own `time` (`null` for one layer).
- `setSeriesVisible(id, visible)`, `setLayerVisible(id, layer, visible)` hide and show.
- `setVisibleRange(spec)`, `setCrosshair({ time } | null)`, `setTheme(theme)`, `setAxis(config)`, `setPadding(padding)`, `setGrid({ visible?, horizontal?, vertical? })` change the view after mount.
- `getSeriesIds()`, `getSeriesIdsByType(type, { visibleOnly?, singleLayerOnly? })`, `getSeriesColor(id)`, `getSeriesLabel(id)`, `getSeriesLayers(id)` describe the series. `type` is a series kind (`'line'`, `'pie'`, …) or `'time'` for every time series.
- `getLayout().chartArea` is the plot rectangle; `coverAxisLabels(el)` hides the axis tick labels under your element ([chart-container.md](chart-container.md#layout)).

## Events

`chart.on(name, fn)` / `chart.off(name, fn)`:

- `crosshairMove(position | null)` — the cursor enters, moves or leaves.
- `viewportChange()` — pan, zoom, resize. An overlay that positions itself by pixel listens to it.
- `dataUpdate()` — data changed.
- `seriesChange()` — a series was added or removed.
- `overlayChange()` — all of the above, plus visibility toggles, series option changes and `setTheme`. It fires whenever an overlay's output can change: an overlay listens to this one event.
- `pointClick(info)`, `pointDoubleClick(info)`, `seriesHover(hit | null)` — the same as the `ChartContainer` callbacks.

## Snapshot helpers

For your own tooltip or info bar, from every framework package:

- `buildHoverSnapshots(chart, { time, sort?, cacheKey })` — a row for each visible series (and each visible layer) at `time`.
- `buildLastSnapshots(chart, { sort?, cacheKey })` — a row for each visible series at its own last point.

Both return a frozen `readonly SeriesSnapshot[]` (rows: [overlays.md](overlays.md#custom-content)). A call with the same `(time, sort, cacheKey)` returns the same array until the chart's data or view changes, so a memoized render skips the cursor moves inside one data point. Give each of your overlays its own `cacheKey` (`'my-tooltip'`), different from the keys of the built-in overlays (`'tooltip'`, `'infobar-hover'`, `'infobar-last'`); overlays that share a key invalidate each other.

`computeTooltipPosition({ x, y, chartWidth, chartHeight, tooltipWidth, tooltipHeight, offsetX?, offsetY? })` returns `{ left, top }` that flips and clamps a floating box inside the chart.

## One theme for several charts (React)

`<ThemeProvider value={theme}>` around several containers gives them all that theme; a container with its own `theme` prop overrides it.
