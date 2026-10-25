# Candlestick chart

`<CandlestickSeries>` draws OHLC candles with optional volume bars. It needs a time X axis. Every option with its default: `CandlestickSeriesOptions` in the installed types ([how to read them](SKILL.md#props-and-options-read-the-installed-types)), or <https://wick-charts.eeff.io/api/candlestick-series/>.

## Data

```ts
interface OHLCData {
  time: number; // epoch ms; OHLCInput also takes a Date
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number; // draws translucent volume bars at the bottom of the plot
}
```

Pass a flat array (`OHLCInput[]`). To name the stream for the tooltip and the info bar, wrap it: `data={{ label: 'BTC', data: candles }}`; there is no `label` option.

Live updates follow [realtime.md](realtime.md): replace the last candle while it is open, append one when a new period starts.

```tsx
setData((prev) => [...prev.slice(0, -1), liveCandle]); // the open candle changes
setData((prev) => [...prev, nextCandle]);              // a new candle
```

## Body colors

`up.body` and `down.body` take a flat color or a `[top, bottom]` gradient pair. `autoGradient(color)` makes a soft gradient from one color; the bundled themes use it.

```ts
import { autoGradient } from '@wick-charts/react';

options={{
  up: { body: autoGradient('#26a69a'), wick: '#26a69a' },
  down: { body: autoGradient('#ef5350'), wick: '#ef5350' },
}}
```

The volume bars take the body color of their candle. Code that needs one flat color from a body (a custom tooltip) calls `resolveCandlestickBodyColor(body)`.

## Styles: hollow, OHLC bars, Heikin-Ashi

`candlePainter` picks how each candle is drawn. Pass a shipped style, or nothing for filled candles.

```tsx
import { heikinAshi, hollowCandle, ohlcBar } from '@wick-charts/react';

const haCandles = useMemo(() => heikinAshi(data), [data]);

<CandlestickSeries data={data} options={{ candlePainter: ohlcBar }} />
<CandlestickSeries data={data} options={{ candlePainter: hollowCandle, colorBy: 'previousClose' }} />
<CandlestickSeries data={haCandles} />
```

- `hollowCandle` outlines a rising body (close ≥ open) and fills a falling one. With `colorBy: 'previousClose'` the color follows the previous close, the usual hollow convention.
- `ohlcBar` draws a high–low line with the open tick on the left and the close tick on the right, in the wick color. `bodyWidthRatio` sets the tick length; `cornerRadius` does not apply.
- Heikin-Ashi is a data transform, not a style, so the tooltip, the axes and `YLabel` show the Heikin-Ashi values. It combines with every style. For the imperative API, `heikinAshiStream()` returns `setData`, `append` and `update` that feed `setSeriesData`, `appendData` and `updateData`.

A custom `CandlePainter` is called once per wick, then once per body (`args.element`), with both rects already moved by the entry and intro animations.

## React

```tsx
import { CandlestickSeries, ChartContainer, Crosshair, githubLight, type OHLCData, TimeAxis, Tooltip, YAxis, YLabel } from '@wick-charts/react';

export function Candles({ data }: { data: OHLCData[] }) {
  return (
    <ChartContainer theme={githubLight.theme} style={{ height: 400 }}>
      <CandlestickSeries id="btc" data={data} options={{ bodyWidthRatio: 0.6 }} />
      <Tooltip />
      <Crosshair />
      <YAxis />
      <TimeAxis />
      <YLabel seriesId="btc" />
    </ChartContainer>
  );
}
```

## Vue

```vue
<script setup lang="ts">
import { CandlestickSeries, ChartContainer, Crosshair, type OHLCData, TimeAxis, Tooltip, YAxis, YLabel } from '@wick-charts/vue';

defineProps<{ data: OHLCData[] }>();
</script>

<template>
  <ChartContainer style="height: 400px">
    <CandlestickSeries id="btc" :data="data" />
    <Tooltip />
    <Crosshair />
    <YAxis />
    <TimeAxis />
    <YLabel series-id="btc" />
  </ChartContainer>
</template>
```

## Svelte

```svelte
<script lang="ts">
  import { CandlestickSeries, ChartContainer, Crosshair, type OHLCData, TimeAxis, Tooltip, YAxis, YLabel } from '@wick-charts/svelte';

  let { data }: { data: OHLCData[] } = $props();
</script>

<ChartContainer style="height:400px">
  <CandlestickSeries id="btc" {data} />
  <Tooltip />
  <Crosshair />
  <YAxis />
  <TimeAxis />
  <YLabel seriesId="btc" />
</ChartContainer>
```

## The usual overlays

| Overlay | Shows |
|---|---|
| `Tooltip` | The OHLCV values at the cursor |
| `Crosshair` | Cursor lines with price and time labels on the axes |
| `YAxis`, `TimeAxis` | The price and time axes |
| `YLabel` | A badge with the last price, and a dashed line at it |
| `InfoBar` | The OHLCV values in the header: at the cursor, else of the last candle |

## Indicators on the price

```tsx
<ChartContainer>
  <CandlestickSeries id="btc" data={{ label: 'BTC', data: candles }} />
  <LineSeries data={{ label: 'SMA 20', color: '#ffd700', data: sma20 }} options={{ strokeWidth: 1, area: { visible: false }, pulse: false }} />
  <LineSeries data={{ label: 'EMA 50', color: '#ff6b6b', data: ema50 }} options={{ strokeWidth: 1, area: { visible: false }, pulse: false }} />
  <Tooltip />
  <Crosshair />
  <YAxis />
  <TimeAxis />
  <YLabel seriesId="btc" />
</ChartContainer>
```

An indicator on its own range (RSI 0–100) goes on a [second Y scale](axes.md#a-second-y-scale) or in a [linked pane](realtime.md#several-linked-charts).

## A custom tooltip: the open → close change

```tsx
import { Tooltip, resolveCandlestickBodyColor, useTheme } from '@wick-charts/react';

// Render inside <ChartContainer>; the slot context has no theme, so read it with useTheme().
export function DeltaTooltip() {
  const theme = useTheme();

  return (
    <Tooltip>
      {({ snapshots, time }) => {
        const candle = snapshots[0]?.data;
        if (!candle || !('open' in candle)) return null;

        const delta = candle.close - candle.open;
        const up = delta >= 0;
        const color = resolveCandlestickBodyColor(up ? theme.candlestick.up.body : theme.candlestick.down.body);

        return (
          <div style={{ display: 'grid', gap: 4 }}>
            <small style={{ opacity: 0.6 }}>{new Date(time).toLocaleString()}</small>
            <strong>{candle.close.toFixed(2)}</strong>
            <span style={{ color }}>
              {up ? '▲' : '▼'} {delta.toFixed(2)} ({((delta / candle.open) * 100).toFixed(2)}%)
            </span>
          </div>
        );
      }}
    </Tooltip>
  );
}
```

The tooltip keeps its own position (flip and clamp); only the content changes. Vue and Svelte take the same context: [overlays.md](overlays.md#custom-content).
