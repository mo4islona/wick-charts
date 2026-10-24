# Band / range chart

`<BandSeries>` fills the region between a `low` and a `high` edge over time: percentile bands (p5–p95), min / max envelopes, Bollinger bands, forecast intervals. Unlike a `LineSeries` area, the fill never closes to the bottom of the plot. Options: `BandSeriesOptions` in the installed types ([how to read them](SKILL.md#props-and-options-read-the-installed-types)).

```tsx
<ChartContainer>
  {/* declare the band first so the line draws over it */}
  <BandSeries data={rows.map((r) => ({ time: r.time, low: r.p5, high: r.p95 }))} />
  <LineSeries data={median} options={{ area: { visible: false } }} />
  <Tooltip />
  <YAxis />
  <TimeAxis />
</ChartContainer>
```

Several bands in one series make a fan chart. The layers draw in order with translucent fills:

```tsx
<BandSeries
  data={[
    { label: 'p5–p95', color: '#6f9ef8', data: outer },
    { label: 'p25–p75', color: '#6f9ef8', data: inner },
  ]}
/>
```

- **Data** (`BandData`): the same shapes as `LineSeries`, with `{ time, low, high }` points — a flat array (one band), an array of arrays, or named `{ label?, color?, data }` layers. A `low` above `high` draws with the edges swapped; a missing or non-finite edge is a gap that splits the band.
- **Colors:** one band uses `theme.bands.upper`, several use `theme.seriesColors`; a layer `color` overrides them. `fill` takes a color or a `[top, bottom]` gradient pair.
- **No stacking.**
- **Overlays:** `Tooltip` and `InfoBar` show `low – high` (the snapshot `data` is a `BandPoint`); the crosshair marks both edges; the Y range covers both edges. `YLabel` skips bands.
- **Streaming** works as on a line ([realtime.md](realtime.md)); `introAnimation` takes the line intros (`unfoldIntro()`, `sweepIntro()`, …).
