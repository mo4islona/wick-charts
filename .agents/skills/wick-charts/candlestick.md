# Candlestick Chart

OHLCV financial chart with automatic volume bars, smart data diffing, and candle gradient rendering.

## Data format

```ts
interface OHLCData {
  time: number;    // timestamp in milliseconds (Date.now() style)
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number; // optional — renders semi-transparent bars in bottom 20%
}

// Also accepts Date objects for time:
type OHLCInput = Omit<OHLCData, 'time'> & { time: number | Date };
```

Pass as a flat array: `OHLCData[]` (or `OHLCInput[]` when using `Date`).

## Series options

```ts
interface CandlestickSeriesOptions {
  label?: string;            // tooltip display name
  upColor: string;           // bullish candle body — default: '#26a69a'
  downColor: string;         // bearish candle body — default: '#ef5350'
  wickUpColor: string;       // bullish wick — default: '#26a69a'
  wickDownColor: string;     // bearish wick — default: '#ef5350'
  bodyWidthRatio: number;    // 0–1, candle body width — default: 0.6
  candleGradient?: boolean;  // vertical gradient on bodies — default: true
}
```

All options are optional — pass `Partial<CandlestickSeriesOptions>`.

## Volume rendering

When data includes `volume`, semi-transparent bars are drawn in the bottom 20% of the chart:
- Bullish volume: `upColor` at 20% opacity
- Bearish volume: `downColor` at 20% opacity

No extra config needed — just include the `volume` field.

## Smart data diffing

When the `data` prop updates:
- **Same length** → only the last candle is redrawn (live price updates)
- **Grew 1–5 items** → appended incrementally
- **Otherwise** → full replace

This enables efficient real-time streaming without manual optimization.

## React

```tsx
import {
  ChartContainer, CandlestickSeries, Tooltip, Crosshair,
  YAxis, TimeAxis, YLabel, darkTheme
} from '@wick-charts/react';
import type { OHLCData } from '@wick-charts/react';
import { useState } from 'react';

function CandlestickChart({ data }: { data: OHLCData[] }) {
  const [seriesId, setSeriesId] = useState('');

  return (
    <ChartContainer theme={darkTheme} style={{ width: '100%', height: 400 }}>
      <CandlestickSeries
        data={data}
        options={{
          upColor: '#26a69a',
          downColor: '#ef5350',
          bodyWidthRatio: 0.6,
          candleGradient: true,
        }}
        onSeriesId={setSeriesId}
      />
      <Tooltip />
      <Crosshair />
      <YAxis />
      <TimeAxis />
      {seriesId && <YLabel seriesId={seriesId} />}
    </ChartContainer>
  );
}
```

### Props

```ts
interface CandlestickSeriesProps {
  data: OHLCData[];
  options?: Partial<CandlestickSeriesOptions>;
  onSeriesId?: (id: string) => void;
}
```

### Real-time updates

```tsx
const [data, setData] = useState<OHLCData[]>(initialData);

// Update current candle (same length → updates last only)
function onPriceUpdate(candle: OHLCData) {
  setData(prev => [...prev.slice(0, -1), candle]);
}

// New candle (grew by 1 → appended)
function onNewCandle(candle: OHLCData) {
  setData(prev => [...prev, candle]);
}
```

## Vue

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
  <ChartContainer :theme="darkTheme" style="width: 100%; height: 400px">
    <CandlestickSeries
      :data="props.data"
      :options="{ upColor: '#26a69a', downColor: '#ef5350', candleGradient: true }"
      @series-id="seriesId = $event"
    />
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

### Real-time updates

```vue
<script setup>
const data = ref<OHLCData[]>([]);

function onPriceUpdate(candle: OHLCData) {
  data.value = [...data.value.slice(0, -1), candle];
}
function onNewCandle(candle: OHLCData) {
  data.value = [...data.value, candle];
}
</script>
```

## Svelte

```svelte
<script>
  import {
    ChartContainer, CandlestickSeries, Tooltip, Crosshair,
    YAxis, TimeAxis, YLabel, darkTheme
  } from '@wick-charts/svelte';

  export let data = [];
  let seriesId = '';
</script>

<ChartContainer theme={darkTheme} style="width:100%;height:400px">
  <CandlestickSeries
    {data}
    options={{ upColor: '#26a69a', downColor: '#ef5350', candleGradient: true }}
    onSeriesId={(id) => seriesId = id}
  />
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

### Real-time updates

```svelte
<script>
  let data = [];

  function onPriceUpdate(candle) {
    data = [...data.slice(0, -1), candle];
  }
  function onNewCandle(candle) {
    data = [...data, candle];
  }
</script>
```

## Typical overlay setup

Candlestick charts commonly use this overlay combination:

| Overlay | Purpose |
|---------|---------|
| `Tooltip` | Shows OHLCV values at cursor position |
| `Crosshair` | Horizontal + vertical guide lines with labels |
| `YAxis` | Animated price axis on the right |
| `TimeAxis` | Time axis at the bottom |
| `YLabel` | Floating price badge at current cursor Y — requires `seriesId` |

## Overlay with indicators

```tsx
<ChartContainer theme={darkTheme}>
  <CandlestickSeries data={ohlcData} onSeriesId={setId} />
  <LineSeries
    data={[sma20]}
    options={{ colors: ['#ffd700'], lineWidth: 1, areaFill: false, pulse: false }}
    label="SMA 20"
  />
  <LineSeries
    data={[ema50]}
    options={{ colors: ['#ff6b6b'], lineWidth: 1, areaFill: false, pulse: false }}
    label="EMA 50"
  />
  <Tooltip />
  <Crosshair />
  <YAxis />
  <TimeAxis />
  {id && <YLabel seriesId={id} />}
</ChartContainer>
```
