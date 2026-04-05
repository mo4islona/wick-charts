# Wick Charts — Vue 3

## Installation

```bash
npm install @wick-charts/vue
```

## Architecture

`ChartContainer` creates a canvas-based `ChartInstance` and provides it via Vue's `provide/inject`.
Series components are renderless — they register/unregister series on mount/unmount.
UI overlays are positioned absolutely over the canvas.

## ChartContainer

```vue
<script setup lang="ts">
import { ChartContainer } from '@wick-charts/vue';
import type { AxisConfig } from '@wick-charts/vue';

const axis: AxisConfig = {
  y: { width: 55, min: 0, max: 'auto', visible: true },
  x: { height: 30, visible: true },
};
</script>

<template>
  <ChartContainer :theme="darkTheme" :axis="axis">
    <!-- Series + overlays -->
  </ChartContainer>
</template>
```

Props: `theme?: ChartTheme` (default: darkTheme), `axis?: AxisConfig`

The container must have a defined width and height.

## Candlestick chart

```vue
<script setup lang="ts">
import {
  ChartContainer, CandlestickSeries, Tooltip, Crosshair,
  YAxis, TimeAxis, YLabel, darkTheme
} from '@wick-charts/vue';
import type { OHLCData } from '@wick-charts/vue';
import { ref } from 'vue';

const props = defineProps<{ data: OHLCData[] }>();
const seriesId = ref('');
</script>

<template>
  <ChartContainer :theme="darkTheme">
    <CandlestickSeries :data="props.data" @series-id="seriesId = $event" />
    <Tooltip />
    <Crosshair />
    <YAxis />
    <TimeAxis />
    <YLabel v-if="seriesId" :series-id="seriesId" />
  </ChartContainer>
</template>
```

### Props & Events

```ts
// Props
data: OHLCData[]
options?: Partial<CandlestickSeriesOptions>

// Emits
@series-id(id: string)
```

## Line / Area chart

```vue
<script setup lang="ts">
import { ChartContainer, LineSeries, Tooltip, Crosshair, YAxis, TimeAxis, dracula } from '@wick-charts/vue';
import type { LineData } from '@wick-charts/vue';

const props = defineProps<{ data: LineData[] }>();
</script>

<template>
  <!-- Single line with area fill -->
  <ChartContainer :theme="dracula">
    <LineSeries
      :data="[props.data]"
      :options="{ colors: ['#00d4aa'], lineWidth: 1, areaFill: true, pulse: true }"
    />
    <Tooltip />
    <Crosshair />
    <YAxis />
    <TimeAxis />
  </ChartContainer>
</template>
```

### Multi-layer

```vue
<template>
  <ChartContainer>
    <LineSeries
      :data="[layer1, layer2, layer3]"
      :options="{
        colors: ['#ff6b6b', '#4ecdc4', '#45b7d1'],
        lineWidth: 1,
        areaFill: false,
        stacking: 'normal',
      }"
      label="Revenue"
    />
    <Tooltip sort="desc" />
    <Crosshair />
    <YAxis />
    <TimeAxis />
  </ChartContainer>
</template>
```

### Props & Events

```ts
// Props
data: LineData[][]   // array of datasets, one per layer. Single line = [data]
options?: Partial<LineSeriesOptions>
label?: string

// Emits
@series-id(id: string)
```

## Bar chart

```vue
<template>
  <ChartContainer>
    <BarSeries
      :data="[layer1, layer2, layer3]"
      :options="{
        colors: ['#ff6b6b', '#4ecdc4', '#45b7d1'],
        barWidthRatio: 0.6,
        stacking: 'normal',
      }"
    />
    <Tooltip />
    <Crosshair />
    <YAxis />
    <TimeAxis />
  </ChartContainer>
</template>
```

### Props & Events

```ts
// Props
data: LineData[][]
options?: Partial<BarSeriesOptions>

// Emits
@series-id(id: string)
```

## Pie / Donut chart

```vue
<script setup lang="ts">
import { ChartContainer, PieSeries, PieTooltip, PieLegend } from '@wick-charts/vue';
import { ref } from 'vue';

const seriesId = ref('');
const slices = [
  { label: 'Sales', value: 4000 },
  { label: 'Marketing', value: 3000 },
  { label: 'Operations', value: 2000 },
];
</script>

<template>
  <ChartContainer>
    <PieSeries
      :data="slices"
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

## Multiple series overlay

```vue
<template>
  <ChartContainer :theme="darkTheme">
    <CandlestickSeries :data="ohlcData" @series-id="candleId = $event" />
    <LineSeries
      :data="[smaData]"
      :options="{ colors: ['#ffd700'], lineWidth: 1, areaFill: false, pulse: false, stacking: 'off' }"
      label="SMA 20"
    />
    <Tooltip />
    <Crosshair />
    <YAxis />
    <TimeAxis />
    <YLabel v-if="candleId" :series-id="candleId" />
  </ChartContainer>
</template>
```

## Vue composables

```ts
import {
  useChartInstance, useVisibleRange, useYRange,
  useLastYValue, usePreviousClose, useCrosshairPosition, useTheme
} from '@wick-charts/vue';

const chart = useChartInstance();                     // ChartInstance (throws if outside ChartContainer)
const range = useVisibleRange(chart);                 // Ref<{ from, to }>
const yRange = useYRange(chart);                      // Ref<{ min, max }>
const last = useLastYValue(chart, seriesId);          // Ref<{ value, isLive } | null>
const prevClose = usePreviousClose(chart, seriesId);  // Ref<number | null>
const crosshair = useCrosshairPosition(chart);        // Ref<{ mediaX, mediaY, time, y } | null>
const theme = useTheme();                             // Ref<ChartTheme>
```

All composables return Vue `Ref` objects — access `.value` in script, use directly in templates.

## Real-time updates

Update reactive `data` — Vue's reactivity handles the rest. The series components use `watch` with deep comparison internally.

```vue
<script setup>
const data = ref<OHLCData[]>([]);

// Append new candle
function onTick(candle: OHLCData) {
  data.value = [...data.value, candle];
}

// Update last candle
function onUpdate(candle: OHLCData) {
  data.value = [...data.value.slice(0, -1), candle];
}
</script>
```
