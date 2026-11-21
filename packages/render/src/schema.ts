import { THEME_NAMES } from './themes';

const layered = (point: string) => ({
  description:
    `One layer: an array of ${point}. Several layers: an array of arrays, or of ` +
    '{ "label": string, "color"?: string, "data": [...] } objects, which also name the legend items.',
});

const seriesCommon = {
  id: { type: 'string', description: 'Stable id, for markers that sit on this series.' },
  visible: { type: 'boolean' },
  options: {
    type: 'object',
    description:
      'Series options, as the `options` prop of the series component, for example { "stacking": "normal" }. ' +
      'A number `format` is a template: "{value}%" gives 68%, "€{value:2}" gives €1,234.50. It works in ' +
      'options.format (gauge, radar) and in options.valueLabels, options.cellLabels and options.labels (Sankey).',
  },
};

const cartesian = {
  ...seriesCommon,
  scale: { type: 'string', description: 'A named Y scale from `scales`.' },
};

const series = {
  type: 'object',
  description:
    'One series. Line, bar, band, candlestick and histogram share the X axis. ' +
    'Pie, radialProgress, gauge, heatmap, depth, radar and sankey fill the chart alone.',
  required: ['type'],
  properties: {
    type: {
      type: 'string',
      enum: [
        'line',
        'bar',
        'band',
        'candlestick',
        'histogram',
        'pie',
        'radialProgress',
        'gauge',
        'heatmap',
        'depth',
        'radar',
        'sankey',
      ],
    },
    ...cartesian,
    data: {
      description: [
        'A "time" is Unix milliseconds or an ISO 8601 string.',
        `line, bar: ${layered('{ "time", "value" } points').description}`,
        'On a category X axis (axis.x.type "category") points are { "x": "name", "value" }.',
        'band: { "time", "low", "high" } points. candlestick: { "time", "open", "high", "low", "close", "volume"? }.',
        'histogram (needs axis.x.type "numeric"): raw samples (number[]) or bins ({ "x0", "x1", "count" }[]).',
        'pie, radialProgress: { "label", "value", "color"? } slices.',
        'heatmap: { "x": string, "y": string, "value" } cells. radar: { "label", "data": number[] } polygons.',
      ].join(' '),
    },
    value: { type: 'number', description: 'gauge only: the value.' },
    bids: { type: 'array', description: 'depth only (needs axis.x.type "numeric"): [price, size] levels.' },
    asks: { type: 'array', description: 'depth only: [price, size] levels.' },
    axes: { type: 'array', items: { type: 'string' }, description: 'radar only: the axis names.' },
    nodes: { type: 'array', description: 'sankey only: { "id", "label"?, "color"? } nodes.' },
    links: { type: 'array', description: 'sankey only: { "source", "target", "value" } links by node id.' },
  },
};

/**
 * JSON Schema of a {@link ChartSpec} as JSON: no `format` functions. Use it
 * to give a model a chart tool in any agent framework.
 */
export const chartSpecSchema = {
  type: 'object',
  required: ['series'],
  properties: {
    width: { type: 'integer', minimum: 16, maximum: 4096, description: 'CSS px. Default 800.' },
    height: { type: 'integer', minimum: 16, maximum: 4096, description: 'CSS px. Default 400.' },
    theme: { type: 'string', enum: THEME_NAMES, description: 'Default "catppuccin" (dark). "githubLight" is light.' },
    background: { type: 'string', description: 'CSS color behind the chart, or "transparent". Default: the theme.' },
    gradient: { type: 'boolean', description: 'The theme background gradient.' },
    title: {
      description: 'A string, or { "text", "sub" } where sub is smaller muted text such as a timeframe.',
    },
    legend: {
      description: 'true, or { "position": "bottom" | "right", "items"?: [{ "label", "color" }] }. Default: none.',
    },
    axis: {
      type: 'object',
      description:
        'X and Y axis config: { "x": { "type": "time" | "numeric" | "category", "visible"? }, ' +
        '"y": { "min"?, "max"?, "position"?: "left" | "right", "scale"?: "log", "visible"? } }. ' +
        '"visible": false removes the axis and gives its room to the plot.',
    },
    scales: { type: 'object', description: 'Named extra Y scales, for example { "volume": { "position": "left" } }.' },
    padding: { type: 'object', description: '{ "top", "bottom", "left", "right" } in CSS px.' },
    visibleRange: {
      description:
        'The X range to show: N for the last N bars, { "from", "to" } or { "from", "bars" }, ' +
        'with times as ISO 8601 strings or epoch ms. Default: all the data.',
    },
    grid: { type: 'object', description: '{ "visible"?, "horizontal"?, "vertical"? }' },
    locale: { type: 'string', description: 'BCP 47 locale for dates and numbers, for example "de-DE".' },
    timeZone: { type: 'string', description: 'IANA time zone for the time axis, for example "UTC".' },
    xAxis: {
      description:
        'false hides the labels and keeps their row (axis.x.visible false removes it); ' +
        'or { "labelCount"?, "minLabelSpacing"? }.',
    },
    yAxis: {
      description:
        'false hides the labels and keeps their column (axis.y.visible false removes it); ' +
        'or { "format"?: "{value}%", "labelCount"?, "minLabelSpacing"? }.',
    },
    series: { type: 'array', minItems: 1, items: series },
    lines: {
      type: 'array',
      description: 'Reference lines: { "value" } for a level or { "time" } for a moment, with "label"?, "color"?.',
    },
    markers: { type: 'array', description: 'Points of note: { "time", "value"? or "seriesId"?, "label"?, "color"? }.' },
    regions: { type: 'array', description: 'Shaded X intervals: { "from", "to"?, "label"?, "fill"? }.' },
  },
} as const;
