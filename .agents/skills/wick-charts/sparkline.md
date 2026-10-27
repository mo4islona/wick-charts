# Sparkline (React only)

`<Sparkline>` is a small inline chart with a value block, for dashboards, metric rows and KPI cards: a non-interactive line or bar chart, the last value, and the change since the first point. Vue and Svelte have no `Sparkline`; build one from a small `ChartContainer` ([line.md](line.md#common-patterns)). Every prop with its default: `SparklineProps` in `node_modules/@wick-charts/react/dist/index.d.ts` ([how to read it](SKILL.md#props-and-options-read-the-installed-types)), or <https://wick-charts.eeff.io/api/sparkline/>. Only `data` is required.

```tsx
import { Sparkline } from '@wick-charts/react';

<Sparkline data={priceHistory} label="BTC/USD" />
```

- **Data:** one flat `TimePoint[]` — not layers.
- **Value block:** the last value through `format` (compact by default) and the change from the first to the last point, green when it is not negative and red otherwise. `sublabel` replaces the change; `valuePosition="none"` hides the block.
- **Theme:** the `ThemeProvider` theme, else the default theme; `theme` overrides it.
- **Size:** the chart is 140 × 48 by default; `width` / `height` change it. A box sized through `style` stretches the chart to its free space: `style={{ width: '100%', height: '100%' }}` fills a grid cell, chart included.
- **Live data:** `flow={{ capacity: 60 }}` holds the window at 60 bars, and each new point scrolls it. Pass at least two seed points so the window can find the interval; `flow.align` places the seed (`'right'` by default, `'left'`, or `'offscreen'` to drive it in).

```tsx
// Bars with a custom format and a color for negative values
<Sparkline data={dailyVolume} variant="bar" label="Volume" format={(v) => `$${v.toFixed(0)}`} color="#4ecdc4" negativeColor="#ff6b6b" />

// Only the chart
<Sparkline data={series} valuePosition="none" width={80} height={24} />

// A fixed text instead of the change
<Sparkline data={latency} label="api-prod-1" sublabel="99.9% uptime" />

// A grid of metric cards
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
  {metrics.map((m) => (
    <Sparkline key={m.id} data={m.series} label={m.label} color={m.color} style={{ width: '100%' }} />
  ))}
</div>
```
