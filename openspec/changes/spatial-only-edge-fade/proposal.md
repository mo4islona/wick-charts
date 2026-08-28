# Stop the edge fade masking pie and heatmap charts

## What and Why

The right-edge fade mask is armed by default on every chart, including ones whose only series is a
pie/donut or a heatmap — where there is no Y-axis column for content to slide under. Outside slice
labels and their leader lines near the right edge get half-erased (issue #75). Gate the automatic
mask on the chart actually having a time axis, exactly as the crosshair and pan/zoom already are.

## Approach

- `ChartInstance.#rightFadeZone` (`packages/core/src/chart.ts:3283`) returns its "off" zone when
  `#fade.right` is auto (`null`) and no visible series is a time-series renderer — reusing
  `#hasTimeSeries()` (`chart.ts:1622`), the predicate that already gates `canPanZoom` and the
  crosshair.
- Off means off for both consumers of that zone: the erase pass in `#applyXFades` (`chart.ts:3250`)
  and the pane-clip widening in `renderMain` (`chart.ts:2931`), which shrinks back to the bare pane.
- An explicit `fade={{ right: n }}` keeps applying on any chart — the issue asks for that, and it
  leaves the documented workaround valid.
- A chart with *no* series keeps the auto mask; only a chart that has series, none of them
  time-axis, counts as spatial-only.
- Refresh the `FadeConfig.right` TSDoc (`packages/core/src/chart/options.ts:158`, currently only
  "A no-op while the Y axis is hidden") and regenerate `docs/data/api-manifest.json` with
  `pnpm api:extract`.
- Cover it in `packages/react/src/__tests__/integration/top-fade.test.tsx`, next to the existing
  exact-geometry assertions, modelled on `spatial-scroll-passthrough.test.tsx`.

## Key Points

- Risk: the gate is re-evaluated per frame, so hiding the last time series while a pie stays visible
  drops the mask the moment `visible` flips — while the hidden series is still cross-fading out.
  Contained: that content is inside the pane, not under the column.
- Blast radius: one predicate in `packages/core/src/chart.ts`, plus a doc comment in
  `chart/options.ts`. Untouched — the React/Vue/Svelte `fade` prop surface, `fade.top`, `fade.left`,
  the gridline-tail taper, the crosshair (already gated), and `yAxisWidth` itself.
- Irreversible: none.
- Trade-offs: a mixed chart (pie beside a line series) keeps the mask, because the axis column is
  genuinely in use there — a pie in such a chart still fades at its right edge. Making the mask
  per-series would mean per-series mask geometry, far past this fix.
- Worth knowing: the repo's own examples already work around this by hand —
  `docs/pages/PiePage.tsx:129` and `docs/pages/charts/index.tsx:162` both pass
  `axis={{ y: { visible: false, width: 0 } }}`, while `.agents/skills/wick-charts/pie.md` does not
  teach it. The default path this fixes is the one an unaided user hits.

## Open Questions

- Should the reserved 55px Y-axis column also collapse on a spatial-only chart? A pie is centred in
  `width - yAxisWidth`, so today it sits left of centre with an empty gutter on the right; the issue
  raises this as a "potentially".
  - Fade only *(recommended)* — fixes the reported masking and leaves every existing pie's size and
    centring exactly as it is.
  - Also auto-collapse the column — the pie recentres and gains ~55px of width, but the layout of
    every existing pie/heatmap chart shifts, and `yAxisWidth` also feeds the navigator, the
    `<YAxis>` element, and overlay geometry.

## Size

medium — the full pipeline, with room for a second round. The recommended scope is a one-predicate
change plus tests; declared medium because the open question above can widen it into pie layout, the
navigator, and the wrapper components.

## Acceptance

#### Scenario: Pie-only chart draws no right edge fade

- **WHEN** a chart is mounted at 800×400 with dpr 1, a single `PieSeries`, and no `fade` prop
- **THEN** the main-layer recorder holds no `destination-out` `fillRect` anchored at `x > 0, y = 0`,
  and the pane clip rect is 745 wide, not 757

#### Scenario: Heatmap-only chart draws no right edge fade

- **WHEN** a chart is mounted with a single `HeatmapSeries` and the default axes
- **THEN** the main-layer recorder holds no `destination-out` right-mask `fillRect`

#### Scenario: Time-series chart keeps the default mask

- **WHEN** a chart is mounted at 800×400 with dpr 1, a single `CandlestickSeries`, and no `fade` prop
- **THEN** the last right-mask erase is still `fillRect(697, 0, 60, 400)`

#### Scenario: Mixed chart keeps the default mask

- **WHEN** a chart mounted at 800×400 with dpr 1 has both a visible `LineSeries` and a visible
  `PieSeries`, and no `fade` prop
- **THEN** the last right-mask erase is `fillRect(697, 0, 60, 400)`

#### Scenario: Explicit fade.right still applies to a pie-only chart

- **WHEN** a pie-only chart is mounted at 800×400 with dpr 1 and `fade={{ right: 20 }}`
- **THEN** the last right-mask erase is `fillRect(737, 0, 20, 400)`

#### Scenario: A chart with no series keeps the default mask

- **WHEN** a chart is mounted at 800×400 with dpr 1, no series children, and no `fade` prop
- **THEN** the last right-mask erase is `fillRect(697, 0, 60, 400)`
