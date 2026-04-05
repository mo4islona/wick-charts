# Wick Charts — Svelte

## Installation

```bash
npm install @wick-charts/svelte
```

## Architecture

`ChartContainer` creates a canvas-based `ChartInstance` and provides it via Svelte context.
Series components are renderless — they register/unregister series on mount/destroy.
UI overlays are positioned absolutely over the canvas.

## ChartContainer

```svelte
<script>
  import { ChartContainer, darkTheme } from '@wick-charts/svelte';

  export let axis = {
    y: { width: 55, min: 0, max: 'auto', visible: true },
    x: { height: 30, visible: true },
  };
</script>

<ChartContainer theme={darkTheme} {axis} style="width:100%;height:400px">
  <!-- Series + overlays -->
</ChartContainer>
```

Props: `theme: ChartTheme` (default: darkTheme), `axis?: AxisConfig`, `style?: string`

The container must have a defined width and height.

## Candlestick chart

```svelte
<script>
  import {
    ChartContainer, CandlestickSeries, Tooltip, Crosshair,
    YAxis, TimeAxis, YLabel, darkTheme
  } from '@wick-charts/svelte';

  export let data = [];
  let seriesId = '';
</script>

<ChartContainer theme={darkTheme}>
  <CandlestickSeries {data} onSeriesId={(id) => seriesId = id} />
  <Tooltip />
  <Crosshair />
  <YAxis />
  <TimeAxis />
  {#if seriesId}
    <YLabel {seriesId} />
  {/if}
</ChartContainer>
```

### Props

```ts
data: OHLCData[]
options?: Partial<CandlestickSeriesOptions>
onSeriesId?: (id: string) => void
```

## Line / Area chart

```svelte
<script>
  import { ChartContainer, LineSeries, Tooltip, Crosshair, YAxis, TimeAxis, dracula } from '@wick-charts/svelte';

  export let data = [];
</script>

<!-- Single line with area fill -->
<ChartContainer theme={dracula}>
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

### Multi-layer

```svelte
<ChartContainer>
  <LineSeries
    data={[layer1, layer2, layer3]}
    options={{
      colors: ['#ff6b6b', '#4ecdc4', '#45b7d1'],
      lineWidth: 1,
      areaFill: false,
      stacking: 'normal',
    }}
    label="Revenue"
  />
  <Tooltip sort="desc" />
  <Crosshair />
  <YAxis />
  <TimeAxis />
</ChartContainer>
```

### Props

```ts
data: LineData[][]   // array of datasets, one per layer. Single line = [data]
options?: Partial<LineSeriesOptions>
label?: string
onSeriesId?: (id: string) => void
```

## Bar chart

```svelte
<ChartContainer>
  <BarSeries
    data={[layer1, layer2, layer3]}
    options={{
      colors: ['#ff6b6b', '#4ecdc4', '#45b7d1'],
      barWidthRatio: 0.6,
      stacking: 'normal',
    }}
  />
  <Tooltip />
  <Crosshair />
  <YAxis />
  <TimeAxis />
</ChartContainer>
```

### Props

```ts
data: LineData[][]
options?: Partial<BarSeriesOptions>
onSeriesId?: (id: string) => void
```

## Pie / Donut chart

```svelte
<script>
  import { ChartContainer, PieSeries, PieTooltip, PieLegend } from '@wick-charts/svelte';

  let seriesId = '';
  const slices = [
    { label: 'Sales', value: 4000 },
    { label: 'Marketing', value: 3000 },
    { label: 'Operations', value: 2000 },
  ];
</script>

<ChartContainer>
  <PieSeries
    data={slices}
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

## Multiple series overlay

```svelte
<ChartContainer theme={darkTheme}>
  <CandlestickSeries data={ohlcData} onSeriesId={(id) => candleId = id} />
  <LineSeries
    data={[smaData]}
    options={{ colors: ['#ffd700'], lineWidth: 1, areaFill: false, pulse: false, stacking: 'off' }}
    label="SMA 20"
  />
  <Tooltip />
  <Crosshair />
  <YAxis />
  <TimeAxis />
  {#if candleId}
    <YLabel seriesId={candleId} />
  {/if}
</ChartContainer>
```

## Svelte stores

```ts
import {
  getChartContext, getThemeContext,
  createVisibleRange, createYRange,
  createLastYValue, createPreviousClose, createCrosshairPosition
} from '@wick-charts/svelte';

// Context (call inside component init)
const chartStore = getChartContext();   // Readable<ChartInstance | null>
const themeStore = getThemeContext();   // Readable<ChartTheme>

// State stores (pass chart instance)
const range = createVisibleRange(chart);                 // Readable<{ from, to }>
const yRange = createYRange(chart);                      // Readable<{ min, max }>
const last = createLastYValue(chart, seriesId);          // Readable<{ value, isLive } | null>
const prevClose = createPreviousClose(chart, seriesId);  // Readable<number | null>
const crosshair = createCrosshairPosition(chart);        // Readable<{ mediaX, mediaY, time, y } | null>
```

All stores are Svelte `readable` stores — use `$store` syntax in templates and reactive statements.

## Real-time updates

Reassign the data prop — Svelte's reactivity handles the rest:

```svelte
<script>
  let data = [];

  // Append new candle
  function onTick(candle) {
    data = [...data, candle];
  }

  // Update last candle
  function onUpdate(candle) {
    data = [...data.slice(0, -1), candle];
  }
</script>

<ChartContainer>
  <CandlestickSeries {data} />
</ChartContainer>
```
