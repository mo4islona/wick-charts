# Measuring chart performance

Wick Charts ships an opt-in `PerfMonitor` that collects FPS, per-layer frame
time (p50/p95), draw-call counts, per-series render timing, and JS heap
usage. It is off by default — no Proxy wrap, no `performance.now()` calls,
no HUD — so production consumers pay nothing.

## Enable the HUD

In React, set `perf` on a `ChartContainer`:

```tsx
import { ChartContainer, CandlestickSeries } from '@wick-charts/react'

<ChartContainer perf>
  <CandlestickSeries id="candle" data={data} />
</ChartContainer>
```

The HUD is a small DOM overlay in the top-right corner of the chart. It
updates at ~10 Hz regardless of how fast the underlying render loop runs.

In the docs playground, the HUD is a toggle in the built-in **Demo** section
and is wired on every Cartesian + Pie page (Candlestick / Line / Bar / Pie).
Sparkline opts out since it renders a thumbnail widget, not a full chart.

## Programmatic access

Attach your own monitor to fan stats out to telemetry (Grafana, Sentry, a
custom dashboard):

```ts
import { ChartInstance, PerfMonitor } from '@wick-charts/core'

const monitor = new PerfMonitor({ windowMs: 10_000 })
monitor.onFrame((stats) => {
  sink.gauge('chart.fps', stats.fps)
  sink.gauge('chart.main_p95_ms', stats.mainFrameMs.p95)
})

new ChartInstance(container, { perf: { monitor, hud: false } })
```

`PerfMonitor.getStats()` snapshots the current rolling window at any time.

## The three instrumentation sites

1. **FPS + frame time** — the two `RenderScheduler` callbacks in
   `packages/core/src/chart.ts` are wrapped with a timer shim when a
   monitor is attached. Result: one `performance.now()` pair per frame per
   layer.
2. **Draw-call counts** — `CanvasManager` swaps the real 2D contexts for a
   counting `Proxy` (`packages/core/src/perf/counting-context.ts`) that
   tallies method names into a `Map<string, number>` owned by the monitor.
3. **Per-series timing** — the series render loop inside
   `ChartInstance.renderMain` times each `renderer.render()` call and
   reports `ms` under the series' public id.

Heap sampling reads `performance.memory.usedJSHeapSize` every ~0.5 s of
main frames. Non-Chromium browsers show `—`.

## Ad-hoc profiling with Chrome DevTools

For deeper drill-downs (flame graphs, specific draw-call cost, GC
correlation), use the Performance panel:

1. Open DevTools → Performance, click Record.
2. Interact with the chart (drag, zoom, trigger streaming).
3. Stop recording, zoom into the flame chart.
4. Look for `renderMain` / `renderOverlay` frames — the top of each frame is
   a full render cycle. Inside you'll see the per-series renderer calls,
   which correspond one-to-one with the `perSeries` keys in `PerfStats`.

If you want to see exactly which canvas methods a renderer issues, enable
the HUD alongside — the `drawCalls` map is a coarse but instant signal that
matches DevTools' method-level breakdown.

## Regression tracking

```
pnpm bench
```

Runs the `perf-render.bench.ts` micro-benchmark against a happy-dom canvas
stub. The absolute numbers aren't comparable to a real browser (no
rasterizer), but the relative scores catch JS-side regressions in the
render path. Today the comparison is eyeball — wiring a JSON baseline with
automated regression gating is a follow-up.
