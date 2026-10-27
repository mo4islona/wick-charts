# Order book (depth chart)

`<DepthSeries>` plots an order book: the cumulative bid size steps down to the best bid left of mid, the cumulative ask size steps up from the best ask right of mid, with a dashed mid line and a `mid · spread` label (`midLine: false` and `midLabel: false` hide them). The fill fades out toward the left and right plot edges (`fillFade` in CSS px, `0` turns it off). It needs a numeric X axis; on a time or category axis `addSeries` throws. Options (`span`, side colors, stroke width, durations): `DepthSeriesOptions` in the installed types ([how to read them](SKILL.md#props-and-options-read-the-installed-types)).

```tsx
<ChartContainer axis={{ x: { type: 'numeric' }, y: { min: 0 } }}>
  <DepthSeries bids={book.bids} asks={book.asks} options={{ span: 0.01 }} />
  <XAxis />
  <YAxis />
  <Crosshair />
  <Tooltip />
  <Legend />
</ChartContainer>
```

- **Data:** `bids` and `asks` are `DepthLevel[]` — `[price, size]` tuples in any order. The series sorts them and computes the cumulative depth. A level with size ≤ 0 is skipped; a repeated price keeps the last size.
- **Live updates:** pass new `bids` / `asks` arrays; each snapshot morphs from the book on screen, and 10 or more updates per second are fine. Imperative: `chart.setSeriesData(id, { bids, asks })`, or `chart.updateData(id, { bids?, asks? })` to merge level changes — a size of `0` removes that level.
- **View:** centred on mid, `span × mid` to each side; without `span`, wide enough for the nearer of the two outermost levels. The view eases to each new mid; wheel and pinch zoom around mid (a double-click resets), and drag-pan is off. Y runs from 0 to the deepest visible cumulative size.
- **Overlays:** the `Tooltip` / `InfoBar` rows are `Bids` and `Asks` (the `Legend` toggles them), with the level price in the header and the cumulative size as the value. With no hover, `InfoBar` shows the best bid and ask.
