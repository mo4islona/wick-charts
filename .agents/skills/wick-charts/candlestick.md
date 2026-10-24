# Candlestick Chart

OHLCV financial chart with automatic volume bars, smart data diffing, and a `body` that supports either a flat color or a 2-stop gradient tuple.

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

Pass as a flat array: `OHLCData[]` (or `OHLCInput[]` when using `Date`). To name the stream for the tooltip / info bar, wrap it: `{ label: 'BTC', data: candles }` — there is **no `label` option** anymore.

## Options

Every option with its default and doc comment: `CandlestickSeriesOptions` in the installed types ([how to read them](SKILL.md#props-and-options-read-the-installed-types)), or <https://wick-charts.eeff.io/api/candlestick-series/>. The sections below cover what a type can't show.

> Prefer the chart-level animations API (`<ChartContainer animations={{ series: { candlestick: { entry, smooth } } }}>`) for new code — it's the canonical surface and groups durations alongside axis / toggle timings. The per-series `entryMs` / `smoothMs` options still work and are the only place to set them per-series-instance. See [SKILL.md → Animations](SKILL.md).

### Flat vs gradient body

Body shape encodes the fill mode:

- `body: '#26a69a'` → flat fill
- `body: ['#80e0c8', '#117d66']` → 2-stop vertical gradient (top → bottom)

For the subtle lightened/darkened look the library used by default before 0.3, wrap a single color in the `autoGradient` helper:

```ts
import { autoGradient } from '@wick-charts/react';

options={{
  up:   { body: autoGradient('#26a69a'), wick: '#26a69a' },
  down: { body: autoGradient('#ef5350'), wick: '#ef5350' },
}}
```

All bundled presets (`githubLight`, `monokaiPro`, …) already use `autoGradient`.

## Volume rendering

When data includes `volume`, semi-transparent bars are drawn in the bottom 20% of the chart:
- Bullish volume: `up.body` top-stop at 20% opacity
- Bearish volume: `down.body` top-stop at 20% opacity

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
  ChartContainer,
  CandlestickSeries,
  Tooltip,
  Crosshair,
  YAxis,
  TimeAxis,
  YLabel,
  autoGradient,
  catppuccin,
} from '@wick-charts/react';
import type { OHLCData } from '@wick-charts/react';

const seriesId = 'btc-ohlc';

function CandlestickChart({ data }: { data: OHLCData[] }) {
  return (
    <ChartContainer theme={catppuccin.theme} style={{ width: '100%', height: 400 }}>
      <CandlestickSeries
        id={seriesId}
        data={data}
        options={{
          up:   { body: autoGradient('#26a69a'), wick: '#26a69a' },
          down: { body: autoGradient('#ef5350'), wick: '#ef5350' },
          bodyWidthRatio: 0.6,
        }}
      />
      <Tooltip />
      <Crosshair />
      <YAxis />
      <TimeAxis />
      <YLabel seriesId={seriesId} />
    </ChartContainer>
  );
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
  ChartContainer,
  CandlestickSeries,
  Tooltip,
  Crosshair,
  YAxis,
  TimeAxis,
  YLabel,
  autoGradient,
  catppuccin,
} from '@wick-charts/vue';
import type { OHLCData } from '@wick-charts/vue';

const props = defineProps<{ data: OHLCData[] }>();
const seriesId = 'btc-ohlc';
const options = {
  up:   { body: autoGradient('#26a69a'), wick: '#26a69a' },
  down: { body: autoGradient('#ef5350'), wick: '#ef5350' },
};
</script>

<template>
  <ChartContainer :theme="catppuccin.theme" style="width: 100%; height: 400px">
    <CandlestickSeries :id="seriesId" :data="props.data" :options="options" />
    <Tooltip />
    <Crosshair />
    <YAxis />
    <TimeAxis />
    <YLabel :series-id="seriesId" />
  </ChartContainer>
</template>
```

### Real-time updates

```vue
<script setup lang="ts">
import { shallowRef } from 'vue';
import type { OHLCData } from '@wick-charts/vue';

// shallowRef: no per-point reactivity to pay for; each update assigns a new array.
// An in-place push followed by triggerRef(data) does not reach the chart.
const data = shallowRef<OHLCData[]>([]);

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
<script lang="ts">
  import {
    ChartContainer,
    CandlestickSeries,
    Tooltip,
    Crosshair,
    YAxis,
    TimeAxis,
    YLabel,
    autoGradient,
    catppuccin,
    type OHLCData,
  } from '@wick-charts/svelte';

  let { data }: { data: OHLCData[] } = $props();
  const seriesId = 'btc-ohlc';
  const options = {
    up:   { body: autoGradient('#26a69a'), wick: '#26a69a' },
    down: { body: autoGradient('#ef5350'), wick: '#ef5350' },
  };
</script>

<ChartContainer theme={catppuccin.theme} style="width:100%;height:400px">
  <CandlestickSeries id={seriesId} {data} {options} />
  <Tooltip />
  <Crosshair />
  <YAxis />
  <TimeAxis />
  <YLabel {seriesId} />
</ChartContainer>
```

### Real-time updates

```svelte
<script lang="ts">
  import type { OHLCData } from '@wick-charts/svelte';

  // $state.raw, not $state: a deep proxy makes the chart read every candle through it.
  let data = $state.raw<OHLCData[]>([]);

  function onPriceUpdate(candle: OHLCData) {
    data = [...data.slice(0, -1), candle];
  }
  function onNewCandle(candle: OHLCData) {
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
| `YLabel` | Floating price badge at current cursor Y — `seriesId` optional (auto-picks the first visible time series) |

## Custom tooltip (slot / render-prop)

Replace the default OHLCV layout — e.g. highlight the open→close delta directly:

```tsx
import { Tooltip, resolveCandlestickBodyColor, useTheme } from '@wick-charts/react';

// Render inside <ChartContainer>; the slot context has no theme, so read it with useTheme().
export function DeltaTooltip() {
  const theme = useTheme();

  return (
    <Tooltip>
      {({ snapshots, time }) => {
        const candle = snapshots[0]?.data; // OHLCData for a candlestick row
        if (!candle || !('open' in candle)) return null;

        const delta = candle.close - candle.open;
        const pct = (delta / candle.open) * 100;
        const up = delta >= 0;
        // Pick a flat color even when the theme's body is a gradient tuple.
        const color = resolveCandlestickBodyColor(up ? theme.candlestick.up.body : theme.candlestick.down.body);

        return (
          <div style={{ display: 'grid', gap: 4 }}>
            <small style={{ opacity: 0.6 }}>{new Date(time).toLocaleString()}</small>
            <strong>{candle.close.toFixed(2)}</strong>
            <span style={{ color }}>
              {up ? '▲' : '▼'} {delta.toFixed(2)} ({pct.toFixed(2)}%)
            </span>
          </div>
        );
      }}
    </Tooltip>
  );
}
```

Same shape in Vue (`v-slot="{ snapshots, time }"`) and Svelte (`let:snapshots let:time`). The built-in floating container (flip + clamp) stays in place — only the contents change. See [SKILL.md → Custom render](SKILL.md) for the full slot catalog.

## Overlay with indicators

```tsx
const id = 'btc-ohlc';

<ChartContainer theme={catppuccin.theme}>
  <CandlestickSeries id={id} data={{ label: 'BTC', data: ohlcData }} />
  <LineSeries
    data={{ label: 'SMA 20', color: '#ffd700', data: sma20 }}
    options={{ strokeWidth: 1, area: { visible: false }, pulse: false }}
  />
  <LineSeries
    data={{ label: 'EMA 50', color: '#ff6b6b', data: ema50 }}
    options={{ strokeWidth: 1, area: { visible: false }, pulse: false }}
  />
  <Tooltip />
  <Crosshair />
  <YAxis />
  <TimeAxis />
  <YLabel seriesId={id} />
</ChartContainer>
```
