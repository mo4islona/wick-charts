# ChartContainer

The root component. It creates the `ChartInstance`, sizes the canvas to its parent and lays out the header (`Title`, `InfoBar`), the plot and the `Legend`. Every prop is optional; the full list is `ChartContainerProps` in the installed types ([how to read them](SKILL.md#props-and-options-read-the-installed-types)).

```tsx
<ChartContainer
  theme={githubLight.theme}
  axis={{ y: { min: 0, max: 'auto' } }}
  padding={{ top: 20, bottom: 20, right: { intervals: 3 }, left: { intervals: 0.5 } }}
  viewport={{ initialRange: 60 }}
  grid={{ vertical: false }}
  style={{ height: 400 }}
>
  {/* series and overlays */}
</ChartContainer>
```

## Layout

- **Size:** the container fills its parent and keeps a 240px `minHeight`; pass `minHeight: 0` in `style` for a smaller chart.
- **`padding.left` / `padding.right`** take pixels or `{ intervals: N }` — N empty data slots. `padding.top` / `padding.bottom` are pixels.
- **`grid`:** `{ vertical: false }` keeps only the horizontal lines; `{ visible: false }` hides the grid.
- **`axis.y.min` / `axis.y.max`** take an `AxisBound`: `'auto'`, a number, a percent offset (`'+10%'`) or `(values) => number`.
- **`axis.y.position: 'left'`** moves the Y axis and shifts the plot area past it; the built-in overlays follow. A custom overlay sizes itself to `chart.getLayout().chartArea` (or offsets scale output by `chart.plotLeft`) instead of assuming a right axis.
- **`headerLayout`:** `'overlay'` (default) floats `Title` / `InfoBar` over the top of the canvas and adds their height to `padding.top`; `'inline'` puts them above the canvas.
- **`fade`:** content that pans under the Y axis fades out (on by default). `fade={true}` — or `fade={{ top: 40 }}` for a fixed height — also fades the plot under a floating header. `fade={false}` turns every fade off.
- **An overlay of your own on an axis** (a price pill, a badge) calls `const cover = chart.coverAxisLabels(el)`: the tick labels under it hide while it shows. Call `cover.update()` after it moves and `cover.remove()` on unmount. `Crosshair` and `YLabel` do this already.

## Visible range

- **`viewport.initialRange`** is the first window, applied before the first paint: a bar count (`60`), `{ from, to }`, or `{ from, bars }`. Use it instead of `chart.setVisibleRange(...)` in an after-mount effect, which zooms a second time on the next frame. It is read at mount.
- **`visibleRange`** makes the window controlled: each new value applies through `chart.setVisibleRange`, and a same-value object is a no-op. Pair it with `onVisibleRangeChange` for a two-way binding.
- **`axis.x.panZoom: false`** turns drag and wheel off; the crosshair still works.

## Events

Callbacks are props (Vue: `@point-click="fn"`, `@ready="fn"`).

| Prop | Fires |
|---|---|
| `onReady(chart)` | once the `ChartInstance` exists, and again after a rebuild |
| `onPointClick(info)` / `onPointDoubleClick(info)` | on a click that is not the end of a drag. A double-click also fits the content. |
| `onCrosshairMove(position \| null)` | on each pointer move; `null` when the pointer leaves |
| `onVisibleRangeChange(range)` | after pan, zoom, `fitContent()`, a data update that scrolls, or a `visibleRange` change |
| `onSeriesHover(hit \| null)` | when the hovered pie slice, heatmap cell or sankey part changes |
| `onEdgeReached(info)` | after a released pan or zoom that went past the first or last point by more than ~10% of the visible range — load more data here ([realtime.md](realtime.md#history-on-scroll)). Read at mount only. |

A click gives `info.x` (epoch ms, a number or a category name) and `info.time`, not the point. Find the point with the chart instance; `info.spatialHit` names the slice or cell of a spatial series.

```tsx
<ChartContainer
  onPointClick={(info) => {
    const point = chartRef.current?.getDataAtTime('price', info.time);
    if (point) select(point);
  }}
  onReady={(chart) => {
    chartRef.current = chart;
  }}
>
  <LineSeries id="price" data={data} />
</ChartContainer>
```

## Time zone and locale

Time labels (axis, crosshair, tooltip header) use the browser's time zone and `'en-US'`. `ChartContainer` has no prop for them: set them on the instance, for example `onReady={(chart) => chart.setTimeZone('UTC')}` and `chart.setLocale('de-DE')`. An `<XAxis format>` of your own replaces the built-in formatting.

## Animations

`animations` sets durations and curves for the whole chart ([animations.md](animations.md)). A new value with the same content does nothing; a real change rebuilds the chart.

## Performance HUD

`perf={perfHud()}` (Vue: `:perf="hud"` with `const hud = perfHud()`) puts an FPS panel on the chart; a click expands it to frame times, draw calls and the render time of each series. `perf` is read at mount. Only an import of `perfHud` adds the HUD code to the bundle. For the numbers without the panel, pass a `PerfMonitor` (`new PerfMonitor()`) and subscribe with `monitor.onFrame((stats) => …)`; several charts can share one monitor, and `perfHud(monitor)` shows the panel for a shared one.
