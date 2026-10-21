# shadcn/ui

Wick Charts has a [shadcn/ui](https://ui.shadcn.com/) registry for React projects. Like shadcn components, its items install as source files in your project, so you can change them. A theme hook builds the chart theme from your CSS variables, a `WickChart` wrapper sizes the chart with classes, and the blocks are ready-made charts in shadcn `Card`s.

## Install an item

Run the shadcn CLI with the item's URL. A block also brings in `wick-chart`, `wick-theme`, the shadcn `card` and the `@wick-charts/react` package.

```bash
npx shadcn@latest add https://wick-charts.eeff.io/r/chart-line-live.json
```

## Install by name

To install items by name, add the registry to `registries` in `components.json` once:

```json
{
  "registries": {
    "@wick-charts": "https://wick-charts.eeff.io/r/{name}.json"
  }
}
```

Then add any item with the `@wick-charts` prefix:

```bash
npx shadcn@latest add @wick-charts/chart-candlestick
```

The registry index, which lists every item, is at [wick-charts.eeff.io/r/registry.json](https://wick-charts.eeff.io/r/registry.json).

## The theme hook

`wick-theme` installs `useWickTheme(ref?)`. It returns a Wick Charts `ChartTheme` built from your shadcn CSS variables: `--background`, `--foreground`, `--muted-foreground`, `--border` and `--chart-1` … `--chart-5`. It follows light and dark mode and any token change on the chart's ancestors. Pass a ref to the chart's wrapper to read the tokens where the chart is, for example inside a scoped `.dark` panel or on a card with its own background.

Series take the `--chart-*` colors in order. Candles and order book sides use the theme's hue instead of green and red.

## The wrapper

`wick-chart` installs `WickChart`: a `ChartContainer` themed by `useWickTheme`. It takes every `ChartContainer` prop. Size it with classes, as you size the shadcn chart container: `aspect-video` by default, `aspect-auto h-[250px]` for a fixed height. It draws horizontal grid lines only; pass `grid` to change that. `theme` takes a theme, or a function that adjusts the generated one. Define that function outside the component, because a new function on each render themes the chart again.

```tsx
import { LineSeries, TimeAxis, type TimePoint, Tooltip, YAxis } from '@wick-charts/react';

import { WickChart } from '@/components/ui/wick-chart';

export function Revenue({ data }: { data: TimePoint[] }) {
  return (
    <WickChart className="aspect-auto h-[250px]">
      <LineSeries data={data} />
      <YAxis />
      <TimeAxis />
      <Tooltip />
    </WickChart>
  );
}
```

## Blocks

Each block is a chart in a shadcn `Card`, with demo data for you to replace.

- `chart-line-live` — a line that gets a new point every second, with an animated live value in the card header.
- `chart-candlestick` — live OHLC candles with an OHLC info bar, a crosshair and a price badge.
- `chart-order-book` — cumulative bid and ask depth around the mid price, updated every second.
- `chart-sparkline-cards` — three KPI cards with a live value, a change badge and an edge-to-edge sparkline.
- `chart-bar-grouped` — two series side by side on a category axis, with a tooltip and a legend that toggles them.
- `chart-pie-donut` — a donut with an animated total in the center.
- `chart-band-latency` — latency percentiles: a median line over p25–p75 and p5–p95 bands.
- `chart-area-stacked` — two series stacked over three months, with a tooltip and a legend.
- `chart-heatmap` — sessions by weekday and hour, with a cell tooltip.
- `chart-line-annotations` — an error rate with an SLO line, a shaded incident window and a deploy marker.
- `chart-line-navigator` — a year of daily closes with a navigator strip to pick the visible window.

The registry is for React. In Vue and Svelte, use `@wick-charts/vue` or `@wick-charts/svelte` directly.
