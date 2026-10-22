// One-paragraph hand-authored intros per component. The auto-generated
// description from the React function's JSDoc is preferred when present;
// this file is the fallback so every API page has a real lead.

export const INTROS: Record<string, string> = {
  // chart series
  LineSeries:
    'Renders one or more line/area layers from time-series data. Each entry in the `data` array becomes a separate stroked path (and optional gradient fill) sharing the same axes and stacking mode. Pass series options via `options` — they merge with the chart-level defaults.',
  BarSeries:
    'Renders bar/column layers. Supports stacked, percent-stacked, and overlapping modes via `options.stacking`. Bar width is computed from the data interval; tweak `options.barWidthRatio` if your bars look too tight or too sparse.',
  CandlestickSeries:
    'Renders OHLC candles with optional volume bars. The default body colour is direction-driven (up/down) but accepts a `bodyColor` callback for custom rules. Wicks render at sub-pixel widths on hi-DPI displays for a sharp look at any zoom.',
  BandSeries:
    'Fills the region between a `low` and a `high` edge over time — percentile bands, min/max envelopes, Bollinger bands, forecast intervals. Pass several layers for a fan chart: each band draws in order with a translucent fill, so nested bands read as one gradient of certainty. The tooltip and info bar show `low – high`, the Y range covers both edges, and a gap splits the band the way it splits a line. There is no stacking. `introAnimation` takes the same `LineIntroFn` styles as `<LineSeries>`.',
  DepthSeries:
    "Renders an order book chart on a numeric price axis — set `axis={{ x: { type: 'numeric' } }}` on `<ChartContainer>`. Pass `bids` and `asks` as `[price, size]` levels in any order; the series sorts them and draws cumulative size as two stepped walls, bids left of mid and asks right, with a dashed mid marker and a `mid · spread` label. The view stays centered on mid: it eases to each new mid, wheel and pinch zoom around mid, and drag-pan is off. A new book morphs from the shape on screen, the walls grow out from mid on the first data, and `<Tooltip>` shows the hovered side, level price and cumulative size. For level deltas, call `chart.updateData(id, { bids?, asks? })` — a size of 0 removes a level.",
  PieSeries:
    'Renders a pie or donut chart. Slices animate on enter/exit, support hover lift, and optionally show inline labels at the slice midpoints. Datasets past 8 slices group the smallest into a single "Other" slice by default — tune or disable via `options.other`. Use `<PieLegend>` and `<PieTooltip>` for accompanying overlays.',
  Sparkline:
    'A self-contained miniature chart for tables, KPIs, and dashboards. Renders without any of the chrome (`<YAxis>`, `<TimeAxis>`, etc.) and includes a lightweight value badge.',

  // subcomponents
  ChartContainer:
    'The root component every chart starts with. Provides theme, axis configuration, padding, and the canvas; collects series and overlays from its children. Use `viewport={{ maxVisibleBars, initialRange }}` to size the streaming window and apply an initial zoom *before* the first paint (same shape as the imperative `chart.setVisibleRange`).',
  XAxis:
    "Renders tick marks and labels along the X axis — time by default, or numbers / category names with `axis={{ x: { type: 'numeric' | 'category' } }}` on `<ChartContainer>`. Density adapts to viewport width and is bounded by the `labelCount` and `minLabelSpacing` props (which override the chart-level defaults); `format` customises the label, the crosshair label and the tooltip header.",
  YAxis:
    "Renders ticks and labels in the value-axis column — on the right by default, or on the left with `axis={{ y: { position: 'left' } }}` on `<ChartContainer>`. The 1-2-5 “nice number” snap keeps tick values readable at any zoom; pass `format` to customise the label string.",
  Tooltip:
    'Floating glass panel that appears on hover, showing per-series snapshots at the crosshair time. Use the render-prop child to replace the panel contents while keeping the positioned container (with flip/clamp).',
  Crosshair:
    'Vertical/horizontal guide lines plus a value badge that follow the pointer. Has no props — it inherits everything from the chart theme.',
  Legend:
    'Series legend with three interaction modes: `toggle` (click hides), `solo` (click isolates), `isolate` (click hides others). Use the render-prop child for fully custom rendering.',
  Navigator:
    'Mini overview strip showing the full series with a draggable zoom window. Pan, resize, and double-click to reset the visible range.',
  Title:
    'Chart title and optional subtitle. Renders inline above the canvas (or as an overlay, depending on `headerLayout` on `<ChartContainer>`).',
  InfoBar:
    'Persistent header strip showing the last-known values from each series, including direction arrows and percent change. Stays visible when no hover is active — the companion to `<Tooltip>`.',
  HeatmapSeries:
    'Renders a matrix heatmap — `(x, y)` category cells colored by value on a perceptual (OKLab) sequential ramp derived from the theme. Cells reveal with a diagonal entrance wave, morph smoothly when values update in place, and lift on hover. Pass 3 ramp stops via `options.colors` for a diverging scale. Use `<HeatmapTooltip>` for the hover overlay.',
  PieLegend:
    'Companion to `<PieSeries>` — renders slice labels with their value or percent, anchored to one of three positions (`bottom`, `right`, `overlay`).',
  HeatmapTooltip:
    "Hover tooltip for `<HeatmapSeries>`. Shows the hovered cell's row · column label, its value, and a small intensity meter locating the value on the color ramp.",
  SankeySeries:
    'Renders a sankey diagram — flows between stages as bands whose width follows the volume. Pass `nodes` (`{ id, label?, color? }`) and `links` (`{ source, target, value, color? }`); each node takes the column of its longest path from a source, and a node with no outgoing link moves to the last column. The layout is deterministic and untangles crossing bands. Links must not form a cycle — the series throws an error that names the nodes on one. A link to an unknown node or without a value above 0 is skipped with a warning. New data morphs the diagram on screen; hovering a node or a link highlights its neighbors. Use `<SankeyTooltip>` for the hover overlay.',
  SankeyTooltip:
    'Hover tooltip for `<SankeySeries>`. Shows the hovered node (or `Source → Target` for a link), its value, and its share of the outflow — of all source nodes for a node, of the source node for a link. The render-prop exposes the hover info and the formatter.',
  PieTooltip:
    'Hover tooltip for `<PieSeries>`. Behaves like `<Tooltip>` but takes a `seriesId` and exposes the active slice in the render-prop.',
  NumberFlow:
    'Animated number ticker. Each changed digit spins in the direction of the change, and a digit that comes or goes slides while the width follows. By default leading zeros collapse into a count (`0.0₅8123`) and large values take a suffix (`1.235B`), so very small and very large values stay short. Used internally by `<YLabel>` — also exported for custom UI.',
  YLabel:
    'Floating price badge anchored to the last data point of a series. Pulses with the data and animates value transitions via `NumberFlow`.',
  Marker:
    'Pins a point annotation to a `time` / `value` — an event marker like "anomaly opened", "deploy shipped", or "alert resolved". Anchor Y explicitly with `value`, or pass a `seriesId` to snap to that series’ value at `time`. Markers render on the overlay layer and stay out of the series model, so they never appear in the tooltip, legend, or Y-range autoscale. Opt into a `pulse` halo and a text `label` per marker.',
};
