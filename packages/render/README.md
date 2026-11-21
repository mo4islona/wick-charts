# @wick-charts/render

Render [Wick Charts](https://wick-charts.eeff.io/) to PNG or SVG in Node, with no browser. Use it for charts in Slack messages, pull requests, reports and emails.

The spec takes the props of `ChartContainer` and its children as data. The same data gives the same chart as in your app: the same engine draws it, with the same themes.

## Install

```sh
npm install @wick-charts/render
```

Node 20 or later. The package draws with [`@napi-rs/canvas`](https://github.com/Brooooooklyn/canvas), which ships prebuilt binaries: no system libraries to install.

## Render a chart

```ts
import { writeFile } from 'node:fs/promises';
import { renderChart } from '@wick-charts/render';

const { data, description } = await renderChart(
  {
    width: 800,
    height: 400,
    theme: 'githubLight',
    title: { text: 'BTC/USD', sub: '1D' },
    legend: true,
    series: [{ type: 'candlestick', data: candles }],
    lines: [{ value: 64_000, label: 'Entry' }],
  },
  { format: 'png', pixelRatio: 2 },
);

await writeFile('chart.png', data);
console.log(description.issues); // likely mistakes, such as a series with no data
```

A theme is a preset name such as `'githubLight'`, a preset object, or a `createTheme()` result. The package exports the presets and `createTheme`.

`background: 'transparent'` leaves the PNG transparent, for an image on a page or a slide of any color.

Axes are on by default. `yAxis: false` hides the Y labels and keeps their column, as a chart with no `<YAxis />` does. `axis: { y: { visible: false } }` gives the column to the plot.

`format: 'svg'` returns an SVG with text as paths, so it looks the same where the viewer lacks the font.

Each series takes the props of its component: `{ type: 'line', data, options }` is `<LineSeries data={data} options={options} />`. The types are `line`, `bar`, `band`, `candlestick`, `histogram`, `pie`, `radialProgress`, `gauge`, `heatmap`, `depth`, `radar` and `sankey`.

## Command line

```sh
npx @wick-charts/render spec.json -o chart.png
cat spec.json | npx @wick-charts/render - -o chart.svg
```

## MCP server

The package includes an MCP server with one tool, `render_chart`. Add it to an agent:

```sh
claude mcp add wick-charts -- npx -y @wick-charts/render mcp
```

Other clients take the same command: `npx -y @wick-charts/render mcp`.

The tool takes a spec as JSON, plus `format`, `pixelRatio` and `output`. With `output`, it writes the file and returns its path; without it, the image comes back inline. A spec mistake comes back as a tool error that names the field.

JSON has no dates and no functions, so a JSON spec can use these forms instead:

- A `time` can be an ISO 8601 string.
- `"scale": "log"` sets a log Y scale.
- A number `format` can be a template: `"{value}%"` gives `68%`, and `"€{value:2}"` gives `€1,234.50`. Digits are grouped for `locale`. Templates work in `yAxis.format`, in `options.format` (gauge, radar), and in the `format` of `valueLabels`, `cellLabels` and Sankey `labels`.

`chartSpecSchema` exports the JSON Schema of the spec, to give a model the same tool in another agent framework.

## Fonts

The package includes Outfit, the font of the default themes. A theme with another font, such as `handwritten`, needs that font on the host, or registered:

```ts
import { registerFont } from '@wick-charts/render';

registerFont({ path: './fonts/Caveat.woff2', family: 'Caveat' });
```

## Limits

- **A static frame.** There is no tooltip, crosshair or animation. The image shows the chart at rest.
- **No edge fades in SVG.** SVG cannot erase what is under it, so an SVG has no fades. A PNG has them.
- **Time zone.** The time axis uses the host's time zone. Set `timeZone` for the same labels on every server.

## License

MIT
