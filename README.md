# WickChart

High-performance financial charting library for React. Canvas-based rendering with HTML overlays.

**[Live Demo](https://mo4islona.github.io/wick/)**

## Features

- **Canvas rendering** — dual-layer architecture (static data + dynamic crosshair)
- **Chart types** — Candlestick, Line, Area, Bar, Stacked Bar
- **Real-time streaming** — batch loading with animated viewport transitions
- **Zoom & Pan** — mouse wheel, drag, pinch-to-zoom, auto-resize
- **12 IDE themes** — Dracula, Night Owl, Catppuccin, Monokai Pro, and more
- **Animated price labels** — digit-spinning NumberFlow component
- **Glass tooltips** — backdrop-blur floating tooltips with OHLCV data
- **Fade-animated axes** — smooth opacity transitions on tick labels
- **React-first API** — declarative components with `useSyncExternalStore`
- **Framework-agnostic core** — imperative `ChartInstance` works without React

## Quick Start

```bash
pnpm add wickchart
```

```tsx
import { ChartContainer, CandlestickSeries, PriceLabel, Crosshair, PriceAxis, TimeAxis } from 'wickchart';

function Chart({ data }) {
  const [seriesId, setSeriesId] = useState(null);

  return (
    <ChartContainer>
      <CandlestickSeries data={data} onSeriesId={setSeriesId} />
      {seriesId && <PriceLabel seriesId={seriesId} />}
      <Crosshair />
      <PriceAxis />
      <TimeAxis />
    </ChartContainer>
  );
}
```

## Themes

```tsx
import { ChartContainer, themes } from 'wickchart';

<ChartContainer theme={themes['Dracula'].theme}>
  {/* ... */}
</ChartContainer>
```

Available: Dracula, One Dark Pro, Monokai Pro, Night Owl, Material Palenight, Gruvbox, Catppuccin, Ayu Mirage, Panda, Andromeda, Handwritten.

## Chart Types

### Candlestick
```tsx
<CandlestickSeries data={ohlcData} />
```

### Line / Area
```tsx
<LineSeries data={lineData} options={{ areaFill: true }} />
```

### Bar
```tsx
<BarSeries data={barData} options={{ positiveColor: '#26a69a', negativeColor: '#ef5350' }} />
```

### Stacked Bar
```tsx
<StackedBarSeries data={[layer1, layer2, layer3]} options={{ colors: ['#26a69a', '#2962FF', '#AB47BC'] }} />
```

## Development

```bash
pnpm install
pnpm dev        # demo at localhost:5173
pnpm build      # library → dist/
pnpm build:demo # demo → docs/
pnpm lint       # biome check
```

## License

MIT
