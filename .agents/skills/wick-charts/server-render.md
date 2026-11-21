# Server render: PNG and SVG in Node

`@wick-charts/render` draws a chart to PNG or SVG in Node, with no browser: for Slack messages, pull requests, reports and emails. The same engine draws it, so the image matches the chart in the app.

```bash
npm install @wick-charts/render   # Node 20+, prebuilt binaries
```

```ts
import { writeFile } from 'node:fs/promises';
import { renderChart } from '@wick-charts/render';

const { data, description } = await renderChart(
  {
    width: 800,
    height: 400,
    theme: 'githubLight',
    title: { text: 'Revenue', sub: 'Q3' },
    legend: true,
    series: [{ type: 'line', data: [{ label: 'Revenue', data: points }] }],
    lines: [{ value: 10_000, label: 'Goal' }],
  },
  { format: 'png', pixelRatio: 2 },
);

await writeFile('revenue.png', data);
console.log(description.issues); // likely mistakes, such as a series with no data
```

## The spec is the app props as data

| App | Spec |
|---|---|
| `<ChartContainer theme axis scales padding grid fade gradient>` | the same keys at the top level |
| `<LineSeries data options />` | `{ type: 'line', data, options }` |
| `<Title sub="Q3">Revenue</Title>` | `title: { text: 'Revenue', sub: 'Q3' }` |
| `<Legend position="right" />` | `legend: { position: 'right' }` |
| `<YAxis format labelCount />`, `<XAxis />` | `yAxis: { format, labelCount }`, `xAxis: {}` |
| `<ReferenceLine>`, `<Marker>`, `<TimeRegion>` | `lines`, `markers`, `regions` |

- `type` is one of `line`, `bar`, `band`, `candlestick`, `histogram`, `pie`, `radialProgress`, `gauge` (`value`), `heatmap`, `depth` (`bids`, `asks`), `radar` (`axes`, `data`), `sankey` (`nodes`, `links`). The data shapes are those of the components.
- Histogram and depth need `axis: { x: { type: 'numeric' } }`.
- `theme` is a preset name (`'githubLight'`), a preset object (`githubLight`), or a `createTheme()` result. The package exports the presets and `createTheme`. Default: `'catppuccin'` (dark).
- Axes are on by default. `yAxis: false` hides the labels but keeps the empty column, as a chart with no `<YAxis />` does. To give the room to the plot, set `axis: { y: { visible: false } }` (`axis.x.visible` for the X row).
- `background: 'transparent'` gives a PNG with no fill. `format: 'svg'` gives text as paths.
- Size: `width` and `height` in CSS px (default 800×400); `pixelRatio` (default 2 for PNG).

## JSON specs: CLI and MCP

JSON has no dates and no functions. A JSON spec uses these forms:

- `time` as an ISO 8601 string: `"2026-10-01"`.
- `"scale": "log"` in `axis.y` or a named scale.
- A number `format` as a template: `"{value}%"`, `"€{value:2}"` (fixed digits). It works in `yAxis.format`, gauge and radar `options.format`, and the `format` of `valueLabels`, `cellLabels` and Sankey `labels`.

```bash
npx @wick-charts/render spec.json -o chart.png
claude mcp add wick-charts -- npx -y @wick-charts/render mcp   # tool: render_chart
```

The MCP tool `render_chart` takes `{ spec, format?, pixelRatio?, output? }`. With `output`, it writes the file and returns its path; without it, the image comes back inline. `chartSpecSchema` is the JSON Schema of the spec, for other agent frameworks.

## Limits

- A static frame: no tooltip, crosshair, animation or `EdgeLoader`.
- Title, legend and axis labels are fixed versions: no render functions, no `style`. `YLabel`, `InfoBar` and custom series types are not available.
- An SVG has no edge fades. A PNG has them.
- The time axis uses the host time zone: set `timeZone` for the same labels on every server.
- A theme with a font other than Outfit needs the font on the host, or `registerFont({ path, family })`.
