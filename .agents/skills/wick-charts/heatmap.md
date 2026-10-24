# Heatmap

`<HeatmapSeries>` draws a matrix of cells colored by value: activity by weekday and hour, a correlation matrix, latency by service and region. It is a spatial series: no axes, no crosshair, no zoom — the chart collapses the axis space by itself, and the series draws its own row and column labels. Options: `HeatmapSeriesOptions` in the installed types ([how to read them](SKILL.md#props-and-options-read-the-installed-types)).

```tsx
import { ChartContainer, type HeatmapCellData, HeatmapSeries, HeatmapTooltip } from '@wick-charts/react';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
const OPTIONS = { rows: WEEKDAYS, columns: HOURS };

export function Activity({ cells }: { cells: HeatmapCellData[] }) {
  return (
    <div style={{ height: 280 }}>
      <ChartContainer>
        <HeatmapSeries data={cells} options={OPTIONS} />
        <HeatmapTooltip format={(v) => Math.round(v).toLocaleString()} />
      </ChartContainer>
    </div>
  );
}
```

- **Data:** a flat array of cells `{ x, y, value, color? }` (`HeatmapCellInput`): `x` is the column key, `y` the row key, both strings. A `null` value leaves the cell empty; a cell `color` skips the ramp.
- **Order:** rows and columns follow first appearance in the data. `rows` and `columns` in the options fix the order, and a key without data gets an empty row or column.
- **Colors:** `colors` is the ramp, low → high (two stops for one hue, three for a diverging scale); by default it comes from the theme. `min` / `max` fix the domain (a correlation matrix: `min: -1, max: 1`); by default it is the data range.
- **Labels:** `axisLabels` (row and column labels, on by default) and `cellLabels` (the value in each cell, off by default; skipped where it does not fit).
- **Live updates:** pass a new array; a cell whose value changes eases to its new color. A change in the grid shape plays the entry reveal again.
- **Hover:** `<HeatmapTooltip>` shows the cell; `onPointClick` gives the cell in `info.spatialHit` (`{ seriesId, index }`), and `onSeriesHover` reports the hovered cell. Do not add `Tooltip`, `Crosshair` or the axes.
