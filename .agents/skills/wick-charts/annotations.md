# Annotations: markers, reference lines, time regions

`Marker`, `ReferenceLine` and `TimeRegion` mark the chart; they are not series. They stay out of the tooltip, the legend and the Y autoscale, so a fake one-point series is never necessary. Render as many as you need. Their fields and defaults: `MarkerConfig`, `ReferenceLineConfig`, `TimeRegionConfig` in the installed types ([how to read them](SKILL.md#props-and-options-read-the-installed-types)).

```tsx
<ChartContainer>
  <LineSeries id="metric" data={metric} />

  {/* a point: explicit Y, or snap to the series' value at `time` */}
  <Marker time={deployMs} value={observed} shape="dot" label="deploy v1.2.3" />
  <Marker time={openedMs} seriesId="metric" shape="arrow-down" pulse label="broke" color="#f0556a" />

  {/* a shaded interval; `to="now"` while it is still open */}
  <TimeRegion from={brokeMs} to={recoveredMs ?? 'now'} fill="rgba(240,85,106,0.1)" color="#f0556a" label="incident" />

  {/* a horizontal threshold, and a vertical event line */}
  <ReferenceLine value={70} label="alert 70" color="#f0a83c" />
  <ReferenceLine time={deployMs} label="deploy v2.1.0" />
</ChartContainer>
```

- **`Marker`** pins a glyph (`'dot'`, `'circle'`, `'arrow-up'`, `'arrow-down'`) and an optional callout label to `time` + `value`. Omit `value` and pass `seriesId` to put it on that series' value at `time`. `pulse` adds the halo of a live line. It draws above the series.
- **`ReferenceLine`** is a horizontal line at `value` or a vertical line at `time` (a `time` wins when both are set). `style` is `'dashed'` (default) or `'solid'`. It draws above the series.
- **`TimeRegion`** shades `from` → `to`; omit `to` or pass `'now'` for a band that runs to the right edge. It draws behind the series. Time X axis only.
- The Y autoscale ignores annotations: a `ReferenceLine` or `Marker` outside the data range is off the plot. To keep a threshold in view, set `axis.y.min` / `axis.y.max` to include it.
- On a chart with [named Y scales](axes.md#a-second-y-scale), `Marker` and `ReferenceLine` take `scale`.
- Imperative: `chart.addMarker(config)` → id, `updateMarker(id, config)`, `removeMarker(id)`; `addRegion` / `updateRegion` / `removeRegion`; `addLine` / `updateLine` / `removeLine`.
