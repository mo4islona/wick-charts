# Wick Charts — React

## Installation

```bash
npm install @wick-charts/react
```

## Architecture

`ChartContainer` creates a canvas-based `ChartInstance` and provides it via React context.
Series components are renderless — they register/unregister series on mount/unmount.
UI overlays are positioned absolutely over the canvas.

## ChartContainer

```tsx
import { ChartContainer } from '@wick-charts/react';

<ChartContainer
  theme={darkTheme}         // optional, default: darkTheme
  axis={{                   // optional
    y: { width: 55, min: 0, max: 'auto', visible: true },
    x: { height: 30, visible: true },
  }}
  style={{ width: '100%', height: 400 }}
  className="my-chart"
>
  {/* Series + overlays */}
</ChartContainer>
```

The container must have a defined width and height.

## Candlestick chart

```tsx
import {
  ChartContainer, CandlestickSeries, Tooltip, Crosshair,
  YAxis, TimeAxis, YLabel, darkTheme
} from '@wick-charts/react';
import { useState } from 'react';

function CandlestickChart({ data }: { data: OHLCData[] }) {
  const [seriesId, setSeriesId] = useState('');

  return (
    <ChartContainer theme={darkTheme}>
      <CandlestickSeries data={data} onSeriesId={setSeriesId} />
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

Smart diffing: same length → update last candle, grew 1-5 → append, otherwise → full replace.

## Line / Area chart

```tsx
import { ChartContainer, LineSeries, Tooltip, Crosshair, YAxis, TimeAxis, dracula } from '@wick-charts/react';

// Single line with area fill
<ChartContainer theme={dracula}>
  <LineSeries
    data={[lineData]}
    options={{ colors: ['#00d4aa'], lineWidth: 1, areaFill: true, pulse: true }}
  />
  <Tooltip />
  <Crosshair />
  <YAxis />
  <TimeAxis />
</ChartContainer>

// Multi-layer with legend
<ChartContainer>
  <LineSeries
    data={[layer1, layer2, layer3]}
    options={{
      colors: ['#ff6b6b', '#4ecdc4', '#45b7d1'],
      lineWidth: 1,
      areaFill: false,
      stacking: 'normal', // 'off' | 'normal' | 'percent'
    }}
    label="Revenue"
  />
  <Tooltip sort="desc" />
  <Legend position="bottom" mode="toggle" />
</ChartContainer>
```

### Props

```ts
interface LineSeriesProps {
  data: LineData[][];  // array of datasets, one per layer. Single line = [data]
  options?: Partial<LineSeriesOptions>;
  label?: string;
  onSeriesId?: (id: string) => void;
}
```

## Bar chart

```tsx
import { ChartContainer, BarSeries, Tooltip, Crosshair, YAxis, TimeAxis, Legend } from '@wick-charts/react';

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
  <Legend position="bottom" mode="toggle" />
</ChartContainer>
```

### Props

```ts
interface BarSeriesProps {
  data: LineData[][];
  options?: Partial<BarSeriesOptions>;
  onSeriesId?: (id: string) => void;
}
```

## Pie / Donut chart

```tsx
import { ChartContainer, PieSeries, PieTooltip, PieLegend } from '@wick-charts/react';

function DonutChart() {
  const [seriesId, setSeriesId] = useState('');

  return (
    <ChartContainer>
      <PieSeries
        data={[
          { label: 'Sales', value: 4000 },
          { label: 'Marketing', value: 3000 },
          { label: 'Operations', value: 2000 },
        ]}
        options={{ innerRadiusRatio: 0.6 }}
        onSeriesId={setSeriesId}
      />
      {seriesId && <PieTooltip seriesId={seriesId} />}
      {seriesId && <PieLegend seriesId={seriesId} format="value" />}
    </ChartContainer>
  );
}
```

### Props

```ts
interface PieSeriesProps {
  data: PieSliceData[];
  options?: Partial<PieSeriesOptions>;
  onSeriesId?: (id: string) => void;
}
```

## Multiple series overlay

```tsx
<ChartContainer theme={darkTheme}>
  <CandlestickSeries data={ohlcData} onSeriesId={setCandleId} />
  <LineSeries
    data={[smaData]}
    options={{ colors: ['#ffd700'], lineWidth: 1, areaFill: false, pulse: false, stacking: 'off' }}
    label="SMA 20"
  />
  <Tooltip />
  <Crosshair />
  <YAxis />
  <TimeAxis />
  {candleId && <YLabel seriesId={candleId} />}
</ChartContainer>
```

## React hooks

```ts
import {
  useChartInstance, useVisibleRange, useYRange,
  useLastYValue, usePreviousClose, useCrosshairPosition, useTheme
} from '@wick-charts/react';

const chart = useChartInstance();                    // ChartInstance from context
const range = useVisibleRange(chart);                // { from, to }
const yRange = useYRange(chart);                     // { min, max }
const last = useLastYValue(chart, seriesId);         // { value, isLive } | null
const prevClose = usePreviousClose(chart, seriesId); // number | null
const crosshair = useCrosshairPosition(chart);       // { mediaX, mediaY, time, y } | null
const theme = useTheme();                            // ChartTheme
```

All state hooks use `useSyncExternalStore` for optimal React 18+ performance.

## ThemeProvider

```tsx
import { ThemeProvider } from '@wick-charts/react';

<ThemeProvider value={catppuccin}>
  <ChartContainer> ... </ChartContainer>
  <ChartContainer> ... </ChartContainer>
</ThemeProvider>
```

When a `ChartContainer` has no `theme` prop, it inherits from the nearest `ThemeProvider`.

## Legend component

```tsx
<Legend />                                    // auto-detect from series, bottom, toggle
<Legend position="right" mode="solo" />       // right side, solo mode
<Legend items={[{ label: 'A', color: '#f00' }]} /> // manual items
```

Legend renders **outside** the chart canvas area. The chart viewport adjusts automatically.
