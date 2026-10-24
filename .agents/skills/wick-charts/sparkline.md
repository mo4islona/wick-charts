# Sparkline

Compact inline chart + value label for dashboards, metric rows, and KPI cards. Wraps `ChartContainer` with a non-interactive `LineSeries` or `BarSeries` plus an optional label / value / change-percent block.

**React only.** Not currently available in Vue or Svelte.

## Import

```tsx
import { Sparkline } from '@wick-charts/react';
import type { SparklineProps, SparklineVariant, SparklineValuePosition } from '@wick-charts/react';
```

## Data format

```ts
import type { TimePoint } from '@wick-charts/react';

const data: TimePoint[] = [
  { time: Date.now() - 60_000, value: 42.1 },
  { time: Date.now() - 30_000, value: 43.7 },
  { time: Date.now(),          value: 45.2 },
];
```

Unlike `LineSeries` / `BarSeries`, `Sparkline` takes a single `TimePoint[]` — **not** nested.

## Props

Every prop with its default: `SparklineProps` in `node_modules/@wick-charts/react/dist/index.d.ts` ([how to read it](SKILL.md#props-and-options-read-the-installed-types)), or <https://wick-charts.eeff.io/api/sparkline/>. Only `data` is required.

## Default behavior

- **Value label**: last point's value, formatted via `format` (compact K / M / decimal).
- **Change %**: computed from first vs last point. Green if non-negative, red otherwise, using the theme's candlestick up/down colors. Overridden by `sublabel`.
- **Non-interactive**: zoom/pan/crosshair disabled; grid and axes hidden.
- **Container**: inline-flex row with rounded tooltip-style background from the theme.

## Examples

### Minimal

```tsx
import { Sparkline, catppuccin } from '@wick-charts/react';

<Sparkline data={priceHistory} theme={catppuccin.theme} label="BTC/USD" />
```

### Bar variant with custom formatter

```tsx
<Sparkline
  data={dailyVolume}
  theme={catppuccin.theme}
  variant="bar"
  label="Volume"
  format={(v) => `$${v.toFixed(0)}`}
  color="#4ecdc4"
  negativeColor="#ff6b6b"
/>
```

### Chart-only (no label block)

```tsx
<Sparkline data={series} theme={catppuccin.theme} valuePosition="none" width={80} height={24} />
```

### Static sublabel instead of change %

```tsx
<Sparkline
  data={latency}
  theme={catppuccin.theme}
  label="api-prod-1"
  sublabel="99.9% uptime"
/>
```

### Grid of metric cards

```tsx
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
  {metrics.map((m) => (
    <Sparkline
      key={m.id}
      data={m.series}
      theme={catppuccin.theme}
      label={m.label}
      color={m.color}
      style={{ width: '100%' }}
    />
  ))}
</div>
```

## Notes

- The component reads `theme.seriesColors[0]`, `theme.candlestick.up.body` / `theme.candlestick.down.body` (flattened via `resolveCandlestickBodyColor` when a gradient tuple), `theme.tooltip.*`, and `theme.axis.textColor` — all themes in `@wick-charts/core` provide these.
- For a fully-custom layout, render a `ChartContainer` with `interactive={false}`, `grid={{ visible: false }}`, and hidden axes directly instead.
