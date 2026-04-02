# WickChart

High-performance financial charting library for React. Canvas-based rendering with HTML overlays.

**[Live Demo](https://mo4islona.github.io/wick/)** | [GitHub](https://github.com/mo4islona/wick)

## Features

- **Canvas rendering** — dual-layer architecture (static data + dynamic crosshair)
- **Chart types** — Candlestick, Line, Area, Bar, Stacked Bar
- **Real-time streaming** — batch loading with animated viewport transitions
- **Zoom & Pan** — mouse wheel, drag, pinch-to-zoom, auto-resize
- **Customizable themes** — 11 built-in presets + full custom theme support
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

WickChart ships with 11 built-in themes inspired by popular IDE color schemes. Each theme includes background, chart colors (candles, lines, bars), typography (font family + sizes), axis colors, tooltip styling, and a 10-color series palette.

### Built-in presets

```tsx
import { ChartContainer, themes } from 'wickchart';

// Use a preset
<ChartContainer theme={themes['Night Owl'].theme}>
  {/* ... */}
</ChartContainer>
```

| Theme | Font | Style |
|-------|------|-------|
| Dracula | Fira Code | Purple/green/pink on dark |
| One Dark Pro | JetBrains Mono | Atom classic |
| Monokai Pro | Fira Code | Sublime vibes |
| Night Owl | JetBrains Mono | Deep navy |
| Material Palenight | Roboto Mono | Purple haze |
| Gruvbox | JetBrains Mono | Retro warm |
| Catppuccin | Inter | Pastel smooth |
| Ayu Mirage | Inter | Muted elegant |
| Panda | Fira Code | Neon dark |
| Andromeda | Roboto Mono | Space purple |
| Handwritten | Caveat | Sepia, sketchy |

### Custom themes

Every visual property is customizable. Pass a full `ChartTheme` object:

```tsx
import type { ChartTheme } from 'wickchart';

const myTheme: ChartTheme = {
  background: '#1a1b26',
  chartGradient: ['#1e1f2b', '#16171f'],
  typography: {
    fontFamily: "'Fira Code', monospace",
    fontSize: 12,
    axisFontSize: 10,
    priceFontSize: 11,
  },
  grid: { color: 'rgba(60, 60, 80, 0.5)', style: 'dashed' },
  candlestick: {
    upColor: '#9ece6a',
    downColor: '#f7768e',
    wickUpColor: '#9ece6a',
    wickDownColor: '#f7768e',
  },
  line: {
    color: '#7aa2f7',
    width: 1,
    areaTopColor: 'rgba(122, 162, 247, 0.12)',
    areaBottomColor: 'rgba(122, 162, 247, 0.01)',
  },
  seriesColors: ['#7aa2f7', '#ff9e64', '#9ece6a', '#bb9af7', '#f7768e',
                  '#e0af68', '#73daca', '#f7768e', '#7dcfff', '#bb9af7'],
  bands: { upper: '#7dcfff', lower: '#f7768e' },
  crosshair: { color: 'rgba(100, 100, 140, 0.4)', labelBackground: '#2a2b3d', labelTextColor: '#c0caf5' },
  axis: { textColor: '#565f89' },
  priceLabel: { upBackground: '#9ece6a', downBackground: '#f7768e', neutralBackground: '#2a2b3d', textColor: '#fff' },
  tooltip: { background: 'rgba(26, 27, 38, 0.92)', textColor: '#c0caf5', borderColor: 'rgba(60, 60, 80, 0.6)' },
};

<ChartContainer theme={myTheme}>
  {/* ... */}
</ChartContainer>
```

## Chart Types

### Candlestick
```tsx
<CandlestickSeries data={ohlcData} />
```

### Line / Area
```tsx
<LineSeries data={lineData} options={{ areaFill: true }} />
```

Area fill colors are auto-derived from the line color. Override with `areaTopColor` / `areaBottomColor`.

### Multi-line
```tsx
{datasets.map((data, i) => (
  <LineSeries key={i} data={data} options={{ color: theme.seriesColors[i], areaFill: true }} />
))}
```

### Bar
```tsx
<BarSeries data={barData} options={{ positiveColor: '#26a69a', negativeColor: '#ef5350' }} />
```

### Stacked Bar
```tsx
<StackedBarSeries data={[layer1, layer2, layer3]} options={{ colors: theme.seriesColors.slice(0, 3) }} />
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
