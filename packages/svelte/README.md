# Wick Charts

<!-- Generated from README.tmpl.md — edit the template, not this file. -->

[![codecov](https://codecov.io/gh/mo4islona/wick-charts/branch/main/graph/badge.svg)](https://codecov.io/gh/mo4islona/wick-charts) [![license](https://img.shields.io/github/license/mo4islona/wick-charts.svg)](./LICENSE)
[![npm @wick-charts/svelte](https://img.shields.io/npm/v/@wick-charts/svelte.svg?label=%40wick-charts%2Fsvelte)](https://www.npmjs.com/package/@wick-charts/svelte)

**Charts for data that never stops.** Prices, metrics, sensors, logs.

Wick Charts draws realtime, animated charts on canvas for React, Vue and Svelte. Give a series an array. When the array changes, the last point eases to its new value, new points join at the edge, and the view follows them. Zoom, pan, crosshair and tooltips work without extra code. There are no runtime dependencies besides your framework.

<a href="https://wick-charts.eeff.io/"><picture><source media="(prefers-color-scheme: dark)" srcset="https://wick-charts.eeff.io/readme/overview-dark.webp"><img alt="Four charts: candlesticks with volume, an area with bands, profit-and-loss bars and a radar" src="https://wick-charts.eeff.io/readme/overview-light.webp"></picture></a>

[Live demo](https://wick-charts.eeff.io/) · [Documentation](https://wick-charts.eeff.io/api/chart-container/) · [Theme editor](https://wick-charts.eeff.io/use-cases/theme/)

## Chart types

Each type has a page in the docs with a live playground. Change a setting, and the **Code** tab next to it shows the code for what you see.

- [Candlestick](https://wick-charts.eeff.io/charts/candlestick/), [order book](https://wick-charts.eeff.io/charts/depth/), [line and area](https://wick-charts.eeff.io/charts/line/), [band](https://wick-charts.eeff.io/charts/band/), [bar](https://wick-charts.eeff.io/charts/bar/)
- [Pie and donut](https://wick-charts.eeff.io/charts/pie/), [heatmap](https://wick-charts.eeff.io/charts/heatmap/), [Sankey](https://wick-charts.eeff.io/charts/sankey/), [gauge and radial progress](https://wick-charts.eeff.io/charts/gauge/), [radar](https://wick-charts.eeff.io/charts/radar/)

<picture>
<source media="(prefers-color-scheme: dark)" srcset="https://wick-charts.eeff.io/readme/market-dark.webp">
<img alt="A dashboard on real market data: a Sankey of 24-hour spot volume from stablecoins to coins, the Fear and Greed gauge, the BTC order book, BTC volume by weekday and hour, and 30-day sparklines for five coins" src="https://wick-charts.eeff.io/readme/market-light.webp">
</picture>

Lines and bars stack, as values or as percents of the total. The X axis takes [time, plain numbers](https://wick-charts.eeff.io/use-cases/x-axis-types/) or [categories](https://wick-charts.eeff.io/use-cases/category-bars/), and a second series can use its own [Y scale](https://wick-charts.eeff.io/use-cases/secondary-scale/).

## Live data

Pass a new array to `data` when the data changes. The series compares it with the previous array:

- A changed last point eases to its new value.
- A few new points at the end are appended.
- Anything else replaces the data.

The view follows the newest point. Pan back into history and it stays where you put it; pan back to the end and it follows again. The [Realtime Data guide](https://wick-charts.eeff.io/use-cases/realtime-data/) shows this and the imperative `appendData` / `updateData` calls.

Keep the array immutable. Each framework has one trap:

- **Svelte 5:** keep chart data in `$state.raw` (or a store) and assign a new array: `data = [...data, point]`. With a deep `$state`, the chart reads every point through a proxy, and a large dataset (100k+ points) blocks the main thread for seconds instead of milliseconds. On Svelte 4, assign a new array the same way.

## Read a chart

- Move the pointer over the chart. The crosshair follows it, the info bar at the top shows the values under it, and `<Tooltip>` shows them next to the pointer.
- Scroll to zoom the time axis. Drag to pan. On a touch screen, pinch to zoom and drag with one finger to pan.
- Double-click to fit all the data in view.
- Set `interactive={false}` on the container for a chart that only shows data.
- `chart.describe()` returns what the chart shows as text: the ranges, each series, and likely mistakes such as a container with no height or a series outside the view. Use it in a test, or let an agent check its own chart.

To keep several charts in step, pass the visible range and the crosshair of one chart to the others from its `viewportChange` and `crosshairMove` events. See [Multi-chart sync](https://wick-charts.eeff.io/use-cases/multi-chart-sync/).

## Annotations

- `<Marker>` pins one moment, such as a deploy or a peak. Give it a `seriesId` and it sits on that series' line.
- `<TimeRegion>` shades an interval. Leave out `to` and it runs to the right edge.
- `<ReferenceLine>` draws a level at a `value`, or a vertical line at a `time`.

Annotations are not data: they stay out of the tooltip, the legend and the Y range. See [Annotations](https://wick-charts.eeff.io/use-cases/annotations/).

## Themes

Pick a built-in theme, build your own with `createTheme()`, or change one in the [theme editor](https://wick-charts.eeff.io/use-cases/theme/). A theme sets the colors, the font and the look of every part of the chart. Tooltips, legends and axis labels also take your own render code and keep their built-in position. See [Custom renders](https://wick-charts.eeff.io/use-cases/custom-renders/).

Each series draws itself in when it mounts. Pick an intro animation per series, or [write your own](https://wick-charts.eeff.io/use-cases/custom-intro/).

## What it adds to your app

- **Code:** tree-shaken ESM, so you ship only the chart types you import. A candlestick chart alone is 55 kB gzipped.
- **Dependencies:** none besides your framework (React 18+, Vue 3.3+, Svelte 4 or 5).
- **DOM:** one `div` with a few `<canvas>` layers and a visually hidden text description per chart.
- **Network:** no requests, no telemetry.

## Limits

- **Server rendering.** The chart draws in the browser only. On the server, the container renders as an empty element.
- **Screen readers.** A chart gives a screen reader a short summary and a full text description, updated at most once a second. A reader cannot step through the points one by one: for a chart that matters, put a data table next to it. `accessibility={false}` turns the text off; `ariaLabel` sets your own summary.
- **Before 1.0.** A minor version can change the API. [MIGRATION.md](https://github.com/mo4islona/wick-charts/blob/main/MIGRATION.md) lists each change with the code to update.

## Install

```bash
npm install @wick-charts/svelte
```

`@wick-charts/svelte` is ESM only: load it with `import`, not `require()`.

## Quick start

```svelte
<script lang="ts">
  import {
    ChartContainer, CandlestickSeries, Tooltip,
    Crosshair, YAxis, TimeAxis, type OHLCInput
  } from '@wick-charts/svelte';

  let { data }: { data: OHLCInput[] } = $props();
</script>

<ChartContainer>
  <CandlestickSeries {data} />
  <Tooltip />
  <Crosshair />
  <YAxis />
  <TimeAxis />
</ChartContainer>
```

This is Svelte 5 with runes. On Svelte 4, declare the prop with `export let data: OHLCInput[];` instead.

`ChartContainer` fills its parent (`width` and `height` are `100%`), so give the parent a height. The container also has a 240px `min-height`, so a parent with no height still shows a chart. For a smaller chart, such as a sparkline in a table row, set `min-height: 0` (`minHeight: 0` in React) in the container's `style`.

## Without a framework

```ts
import { CandlestickSeriesDef, ChartInstance, type OHLCInput } from '@wick-charts/react';

const el = document.getElementById('chart');
if (!el) throw new Error('No #chart element');

const data: OHLCInput[] = [
  { time: Date.now() - 60_000, open: 100, high: 104, low: 98, close: 103 },
  { time: Date.now(), open: 103, high: 107, low: 101, close: 102 },
];

const chart = new ChartInstance(el);
const seriesId = chart.addSeries(CandlestickSeriesDef, {});
chart.setSeriesData(seriesId, data);
```

There is no `@wick-charts/core` package on npm: install the engine through one of the framework packages.

### Drop-in `<script>` — no build step

For a CodePen, a JSFiddle or a plain HTML page, load the prebuilt UMD bundle from a CDN. It puts the whole engine on a `WickCharts` global:

```html
<div id="chart" style="width: 640px; height: 320px"></div>

<script src="https://cdn.jsdelivr.net/npm/@wick-charts/react/dist/wick-charts.umd.min.js"></script>
<script>
  const { ChartInstance, LineSeriesDef } = WickCharts;

  const chart = new ChartInstance(document.getElementById('chart'));
  const id = chart.addSeries(LineSeriesDef);
  chart.setLayerColors(id, ['#22c55e']);
  chart.setSeriesData(id, [
    { time: Date.now() - 2 * 86_400_000, value: 100 },
    { time: Date.now() - 86_400_000, value: 118 },
    { time: Date.now(), value: 109 },
  ]);
</script>
```

The same file is on unpkg (`https://unpkg.com/@wick-charts/react/dist/wick-charts.umd.min.js`); pin a version with `@x.y.z` for production. The file is self-contained.

## Documentation

Every component, prop, type and slot context is in the docs site. Start at [ChartContainer](https://wick-charts.eeff.io/api/chart-container/), then pick a series or an overlay in the sidebar.

## Contributing

Bug reports, feature requests and pull requests are welcome. Open an [issue](https://github.com/mo4islona/wick-charts/issues) first for anything larger than a small fix, so we can agree on the approach.

```bash
pnpm install
pnpm dev         # docs site with every chart type at http://localhost:5173
pnpm test        # unit and integration tests
pnpm lint        # Biome
pnpm typecheck
```

A pull request should pass `pnpm test`, `pnpm lint` and `pnpm typecheck`, and add a test for each bug fix.

## License

MIT — always free and open.