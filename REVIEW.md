# Wick Charts — Full Review

## ✅ Fixed in this pass (quick wins + P0)

All 11 items below are implemented in the working tree, with regression tests. `pnpm typecheck` clean; **1306 tests pass** (145 files); touched files lint-clean.

| # | Fix | Files | Test |
|---|-----|-------|------|
| P0-1 | Hermite Y curve projects carried velocity onto travel direction — kills the streaming overshoot on the default Y curve | `animation/y-range-hermite.ts` | `animation/y-range-hermite.test.ts` |
| P0-2 | Pie `#sliceValue`/`#total` sanitize negative & non-finite slice values across arc / percent / hit-test (original value still reported) | `series/pie.ts` | `renderers/pie-sanitize.test.ts` |
| P0-3 | 2→1 finger transition re-seeds single-finger pan (+ `touchcancel` reset) — no more dead gesture after a pinch | `interactions/handler.ts` | `interaction-handler-touch.test.ts` |
| P0-4 | Pinch distance uses `Math.hypot` + zero-guard + factor clamp — vertical/rotated pinch no longer dead or Infinity | `interactions/handler.ts` | `interaction-handler-touch.test.ts` |
| P0-5 | Canonical `syncSeriesLayer` helper; **all 9 React/Vue/Svelte Line/Bar/Candle wrappers** delegate to it — Vue/Svelte now stream without per-tick Y-snap (rolling-window → `appendData`+`keepLast`) | `data/sync.ts`, `index.ts`, `react/*`, `vue/*`, `svelte/*` | `sync.test.ts` + existing vue/svelte `streaming-keepLast` |
| QW2 | `easeOutCubic` on line + candle grow/entrance geometry — removes the constant-velocity head + hard-stop pop | `series/line.ts`, `series/candlestick.ts` | (covered by existing renderer suites) |
| QW6 | Grid + crosshair `lineWidth` scaled to device px (odd-only half-pixel snap) — crisp HiDPI hairlines | `components/grid.ts`, `components/crosshair.ts` | `components/grid-crosshair-hidpi.test.ts` |
| QW7 | `expandHex` normalizes shorthand/`#000`/`#fff` in `createTheme`/`isDarkBg`/`hexToRgba`/lighten/darken — no NaN channels, `#000`→dark | `theme/create.ts` | `create-theme.test.ts` |
| QW8 | Volume scale snaps (not eases) on the decimation-boundary frame via `#prevDecimated` — no ~30-frame band saturation | `series/candlestick.ts` | (covered by existing volume-scale suite) |
| QW9 | Crosshair-dot halo via `globalAlpha` instead of color-string splicing — format-agnostic (hsl / shorthand / 8-digit safe) | `series/line.ts` | (visual; full suite regression) |
| QW10 | React crosshair time pill uses resolved `niceTickValues` interval, not the raw data interval | `react/ui/Crosshair.tsx` | (visual) |

> `autoGradient` shorthand-expansion was intentionally **not** changed — the flat-`[c,c]`-tuple-for-shorthand behavior is a documented contract (`theme/resolve.test.ts`).

Everything below is the original review (remaining P1/P2 + the jaw-drop roadmap), left intact for follow-up work.

## Fixed in the v0.4.x follow-up

A second pass (on `release/0.4.1`) closed more of the backlog below — `pnpm typecheck` clean, Biome clean, full suite green; each carries a regression test unless noted.

| # | Fix | Files | Test |
|---|-----|-------|------|
| P1-8 | Live-value chase (candle OHLC / line / bar) moved off the `easeOutCubic` Animator onto a velocity-continuous `ScalarSpring` — kills the per-tick "kick" on sub-`smoothMs` feeds. Entrance tweens + alpha fades stay on `Animator`. | `animation/scalar-spring.ts`, `series/candlestick.ts`, `series/base-multi-layer.ts` | `animation/scalar-spring.test.ts`, `animation/series-retarget.test.ts` |
| P1-9 | Navigator brush window glides with the eased visual (`getAnimationState().xRange` via `tickFrame`) instead of snapping to the logical target; brush-drag stays on logical. | `navigator/controller.ts` | `navigator/window-glide.test.ts` |
| #12 (axis half) | DOM-label `sync` no longer runs 2–3× per animating frame — the redundant per-frame `viewportChange` is skipped while the viewport animates (`tickFrame` drives it). Overlay double-draw + full-bitmap clear still open. | `axis/dom-labels.ts` | `chart-axis-labels-coalesce.test.ts` |
| P2-dedup | `easeOutCubic` single impl in `animation/easing.ts` (removed from `utils/math.ts`); `lighten` single impl in `utils/color.ts` (blend-toward-white) with `create.ts`/`pie.ts` delegating — fixes the additive hue-shift on the candle auto-gradient. | `utils/math.ts`, `theme/create.ts`, `series/{candlestick,line,pie}.ts` | `animation/easing.test.ts` |
| P2-dead | Removed dead `renderWindow` (+ its test block) and `setXThreshold` (+ the dead `#x.threshold` field & filter branch). | `navigator/render.ts`, `animation/viewport-engine.ts` | — |

Also fixed, not from the original review: axis tick labels now follow live theme changes (`axis/dom-labels.ts`, shipped v0.4.0).

## Fixed in the v0.4.2 follow-up

Cross-framework parity pass on `release/0.4.2` — three Vue/Svelte-vs-React gaps from the P2 list below. `pnpm typecheck` clean; touched test files Biome-clean; Vue + Svelte suites green (113 tests); each fix carries a regression test.

| # | Fix | Files | Test |
|---|-----|-------|------|
| V1 | Vue/Svelte `Crosshair` time pill now formats at the *resolved* tick interval (`timeScale.niceTickValues(dataInterval).tickInterval`) instead of the raw data interval — a time-of-day badge no longer floats among date labels when zoomed out (React already had this). | `vue/src/ui/Crosshair.vue`, `svelte/src/ui/Crosshair.svelte` | `vue/__tests__/crosshair.test.ts` |
| V2 | Vue/Svelte `Crosshair` theme is reactive — both subscribe to `overlayChange` and read a `bump` in the theme computed, so label colors track a runtime `setTheme` swap instead of freezing on first render (matches Tooltip/PieTooltip). | `vue/src/ui/Crosshair.vue`, `svelte/src/ui/Crosshair.svelte` | `vue/__tests__/crosshair.test.ts` |
| V3 | `useLastYValue` / `createLastYValue` track `yScale.valueToY(value)` and re-emit on pixel-Y drift, so a consumer-positioned badge follows pan/zoom/resize when the value is unchanged; the early-return guard preserves identity when neither value nor pixel moved. | `vue/src/composables.ts`, `svelte/src/stores.ts` | `vue/__tests__/composables.test.ts`, `svelte/__tests__/stores.test.ts` |

> Excluded from this pass (per scope): the Vue/Svelte `EdgeLoader` equivalent and any `Sparkline` parity work.

## Fixed in the v0.4.3 follow-up

Performance pass on `release/0.4.3` — the remaining hot-path waste from the P1/P2 lists below. `pnpm typecheck` clean; full suite green (168 files / 1423 tests); touched files Biome-clean; each fix carries a regression test.

| # | Fix | Files | Test |
|---|-----|-------|------|
| #12 (rest) | Overlay no longer cleared + repainted twice per frame: `RenderScheduler.consume()` + a `#renderFrame` wrapper — the main frame paints the overlay synchronously and consumes the overlay scheduler's queued duplicate. Empty overlay skips the full-bitmap clear (`#overlayHasContent`; one erasing clear on the painted→empty transition). The in-main overlay pass now books to the perf monitor as an `overlay` frame, fixing the main-layer mis-attribution. | `chart.ts`, `render-scheduler.ts` | `chart-overlay-frame.test.ts`, `render-scheduler.test.ts` |
| Nav-perf | Navigator render path split: `tickFrame`/`viewportChange` only reposition the window DOM (the miniature depends on data/theme/size, so pan/zoom glide never re-decimates or repaints the canvas); decimation memoized by `(array ref, buckets)`; `canvas.width/height` writes guarded — no backing-store reset when the size didn't change. Also retires the "vestigial `#dirty`" item: the flag now meaningfully selects full-render vs window-only frames. | `navigator/controller.ts` | `navigator/render-path.test.ts` |
| Axis-sync | DOM axis labels no longer sync twice per streaming tick: the `overlayChange` handler (one emit per data tick) skips while the engine animates — `tickFrame` already drives the per-frame sync and re-reads theme + ticks; idle theme/data swaps still sync immediately. | `axis/dom-labels.ts` | `chart-axis-labels-coalesce.test.ts` |
| Candle-grad | Body gradients cached by `(colors, height quantized to whole px)` and positioned via `ctx.translate` — no `createLinearGradient` per candle per frame; same-height bodies share one gradient. | `series/candlestick.ts` | `renderers/candlestick-rounded.test.ts` |
| Append-batch | `syncSeriesLayer` wraps the rolling-window `appendData`+`keepLast` pair and multi-point tail bursts in `chart.batch()` — one `onDataChanged` pass / engine retarget per commit instead of two (or one per burst point). Chose the existing `batch` primitive over a new `store.appendAndTrim` API. | `data/sync.ts` | `sync.test.ts` |
| Vis-gate | `RenderScheduler` gates the RAF re-arm on `document.hidden` (browsers pause RAF in hidden tabs, but Electron with `backgroundThrottling` off and some webviews don't); the owed frame fires on the visible flip. | `render-scheduler.ts` | `render-scheduler.test.ts` |

Still open from the items above: pie `#labelReveal` reset for inside mode, and the dead `theme.line.areaTopColor/areaBottomColor` on the main plot (a latent bug — plumb them in, don't delete).

---

## Verdict

The animation core is genuinely well-engineered: the X spring and Y autoscale are analytically closed-form,
frame-rate-independent, and velocity-continuous across mid-flight retargets, and the dual-scheduler / tick-tracker /
sticky-Y machinery is mature. The smoothness goal is undercut by a small number of real defects clustered at the seams —
a velocity-carry overshoot in the **default** Y curve, a live-value chase that still uses the easeOutCubic "kick" the
springs were built to remove, and the navigator window snapping to the zoom target while the canvas eases. Visualization
correctness is solid except for three concrete data-integrity gaps (negative/NaN pie values, LTTB collapsing NaN gaps,
volume-band saturation across the decimation boundary) and pervasive HiDPI hairline/contrast issues. The biggest
non-core risk is cross-framework: Vue/Svelte LineSeries/BarSeries snap Y on every streaming tick where React eases.

## P0 — must fix (correctness / visible jank)

### 1. Default Y curve (Hermite) overshoots when carried velocity feeds a sticky-contract segment

`packages/core/src/animation/y-range-hermite.ts:166-177` (retarget at :93-100). Hermite is the **default** Y curve (
`config.ts:478 curve: rawY?.curve ?? hermite()`). On a mid-flight retarget it carries the sampled `v0` (`#v0Min/#v0Max`)
into a new cubic with **no projection onto the direction of travel**; the `h10 * dur * v0` term scales linearly with the
per-side duration (`#contractMs` up to 2500ms). During streaming, a fast outward expand whose velocity is carried into a
slow inward contract balloons the bound *further outward* before settling back (verified: realistic streaming trace
peaks ~30+ units past target; the spring overshoots ~2x less but is not overshoot-free either).
**Fix:** in `retarget`, project carried velocity onto the travel direction and zero it when it points away:
`this.#v0Max = Math.sign(vMax) === Math.sign(value.max - x.max) ? vMax : 0` (and mirror for min). This kills the
adverse-velocity balloon while preserving velocity-continuity for same-direction retargets. Add a regression test (
expand → tick → contract with adverse velocity, assert the bound never exceeds `max(startMax, prevPeak)+eps`). Do **not
** swap the default to the spring as the headline fix — it only halves the excursion.

### 2. Negative / non-finite pie slice values corrupt arc layout, percentages, and hit-test

`packages/core/src/series/pie.ts` (total reduces at :336/392/406/834; sliceAngle at :888; percent at :449).
`PieSliceData.value` is unconstrained and never clamped. A mix like `[{value:100},{value:-40}]` gives `total=60`, slice
0 sweeps ~600° (overpaints the disk), the negative slice drags `angle += sliceAngle` backward (desyncing
fills/labels/hitTest), and percentages render 167% / -67%. NaN/Infinity values skip the `total <= 0` guard (`NaN <= 0`
is false) → blank disk.
**Fix:** add a layout-only sanitizer `#sliceValue(d) = Number.isFinite(d.value) && d.value > 0 ? d.value : 0` and route
every total/angle/percent read through it (keep the original value in reported SliceInfo). Add
`if (!Number.isFinite(total) || total <= 0) return;`. One change closes both the negative-value and NaN-value findings.

### 3. Going from two fingers to one kills pan/zoom until all fingers lift

`packages/core/src/interactions/handler.ts:119-126`. `onTouchEnd` only resets when `e.touches.length === 0`. Lifting one
finger of a pinch fires touchend with length 1 → no-op, so `touchCount` stays 2 and `onTouchMove` matches neither
branch (single-finger pan needs `touchCount===1`, pinch needs `length===2`). "Pinch then drag with one finger" — a very
common gesture — goes completely dead.
**Fix:** handle the 2→1 transition in `onTouchEnd`: when `e.touches.length === 1`, set `touchCount = 1`,
`lastTouchDist = 0`, and re-seed pan via
`this.pan.handleMouseDown({ button: 0, clientX: e.touches[0].clientX } as MouseEvent)` (the 2-finger start never set
`pan.dragging`, so re-seeding is required). Add a `touchcancel` listener mapped to the same reset.

### 4. Pinch zoom uses X-only distance + no zero guard

`packages/core/src/interactions/handler.ts:94,105,110`. Distance is
`Math.abs(touches[0].clientX - touches[1].clientX)` — X projection only. A vertical pinch yields `dist≈0` →
`factor = lastTouchDist / dist` = Infinity (the `lastTouchDist > 0` guard protects the numerator, not the denominator);
a 45° pinch yields ~0.7x; rotating fingers mid-gesture makes the factor jitter. Infinity/huge factors either snap to
full zoom-out (data present, clamp at `pan-zoom-math.ts:245`) or commit a NaN window when `hardMaxRange===null` (empty
chart).
**Fix:** Euclidean distance `Math.hypot(dx, dy)` in both `onTouchStart` and `onTouchMove`; guard
`if (dist > 0 && this.lastTouchDist > 0)`; clamp `factor` to `[0.1, 10]`. Keep the `center` anchor X-only (zoom is
single-axis). Optionally bail in `computeZoom` on non-finite factor.

### 5. Vue/Svelte LineSeries & BarSeries snap Y on every streaming tick (no append path)

`packages/vue/src/LineSeries.vue:36-46`, `packages/svelte/src/LineSeries.svelte:28-37`, and the BarSeries equivalents.
They call `chart.setSeriesData(id, data[i], i)` per layer on every prop change, which sets
`#dataReplaceSnapPending = true` (`chart.ts:522`) → synchronous Y snap (`onDataReplaced` → `transition.snap`) and clears
entrance animators (`base-multi-layer.ts:137 entries[i].clear()`). React routes through append/keepLast/updateData (
`LineSeries.tsx:43-90`) and eases. So a streaming line/bar chart is buttery in React and snaps every tick in
Vue/Svelte — the exact jank the React machinery exists to prevent. Note Vue/Svelte *CandlestickSeries* already have a (
lesser) incremental path, so this is an internal within-framework parity regression too.
**Fix:** Upgrade `core/src/data/sync.ts` into the single canonical helper (add per-layer support + rolling-window
`appendData+keepLast` via first/last-timestamp comparison, align threshold to React's 20, drop the `as any` casts) and
have all three wrappers' Line/Bar/Candle delegate to it. This also resolves findings #6 and #7 below at the root.

## P1 — high-value smoothness & visual fixes

### 6. YLabel badge/dashed-line reads the RAW last value, leading the smoothed line tip

`packages/core/src/chart/last-value.ts:38-43` returns `extractValue(last)` (raw store value), while the line tip/pulse
glide via `effectiveValue()` → `displayedLastValues` over `smoothMs` (default 250ms). On every live `updateLastPoint`
tick the badge + dashed guide snap to the final value while the canvas head eases toward it — the badge visibly leads. (
overlayChange fires per tick via `#bumpOverlayVersion`, so it's a *lead*, not a lag.)
**Fix:** add `getDisplayedLastValue(layer)` returning `displayedLastValues[layer]` and prefer it in `getLastValue`/
`getStackedLastValue` when the last point is on-screen (`isLive`). Then emit a per-frame signal while the chase is live
so the badge follows the glide: widen the `tickFrame` gate (`chart.ts:1899`) to include `seriesNeedsAnim`, or have
YLabel subscribe to `tickFrame`.

### 7. Vue/Svelte CandlestickSeries use >5 bulk threshold + lack the rolling-window keepLast branch

`packages/vue/src/CandlestickSeries.vue:46-54`, `packages/svelte/src/CandlestickSeries.svelte:37-47`. A 6–20 candle
burst takes the smooth append path in React (`>20`) but the Y-snapping `setSeriesData` path here. Worse, neither tracks
first/last timestamps, so a fixed-`maxPoints` rolling window (length constant) hits `updateData(data[last])` —
overwriting the existing last bar in place while the array's last element now carries a *different* timestamp, and the
head is never trimmed → **stale/incorrect window** (a correctness bug, not just smoothness).
**Fix:** port React's timestamp-aware branch ladder (raise cutoff to 20, add
`shifted && added===0 && hasNewLast → appendData + keepLast`). Folds into the shared-helper fix in #5.

### 8. Streaming live-value chase uses Animator + easeOutCubic with per-tick setTarget — the "kick" the springs removed

> **DONE (v0.4.x)** — chase moved to a velocity-continuous `ScalarSpring` (`animation/scalar-spring.ts`); see the follow-up table above.

`packages/core/src/series/candlestick.ts:184-193` and `base-multi-layer.ts:179-187`. The live OHLC/line/bar chase
creates `Animator` with default `easeOutCubic` and calls `setTarget` per tick. Mid-flight `setTarget` (
`animator.ts:112-134`) restarts the curve at t=0 where easeOutCubic's derivative is maximal (3), injecting a fresh
velocity step each tick — the exact decel/re-accel twitch documented as the reason X/Y became springs (
`visible-range-spring.ts:13-20`). Fires only when intra-bar update cadence < `smoothMs` (the shipped docs throttle at
500ms > 250ms, so invisible there, but live trading feeds at 100ms hit it).
**Fix:** replace the chase `Animator` with a velocity-continuous critically-damped spring (factor a reusable
`ScalarSpring` out of the existing per-side spring math; run 4 for OHLC, 1 for line/bar), keep one-shot entrance tweens
on Animator. Note: `easeLinear` is **not** a fix — only a spring carries velocity across retargets.

### 9. Navigator window snaps to the zoom/pan target while the main chart eases

> **DONE (v0.4.x)** — navigator subscribes to `tickFrame` and sources the window from `getAnimationState().xRange` when idle (logical during brush-drag); `navigator/window-glide.test.ts`.

`packages/core/src/navigator/controller.ts:498-502`. `#updateOverlayDom` reads `chart.getVisibleRange()` (the committed
*logical* target, `chart.ts:745-757`), not the engine's eased visual. On every wheel-zoom/pan the brush window jumps to
the destination while the canvas glides there over ~150ms. The chart already solved this for DOM axis labels via the
per-frame `tickFrame` event (`chart.ts:1899`, consumed by `dom-labels.ts:126`); the navigator is the lone consumer left
out.
**Fix:** subscribe the navigator to `tickFrame` (reuse `#markDirty`), and source the window X from
`chart.getAnimationState().xRange` (the eased visual) when not dragging; keep brush-drag on the logical/snapped path.

### 10. Volume band saturates to full height for ~30 frames when the window crosses the decimation threshold

`packages/core/src/series/candlestick.ts:349,519,548`; `data/decimation.ts:25`. `decimateOHLCData` SUMS bucket volume;
on the frame `visibleData.length` crosses `pixelWidth*2`, every bar becomes a bucket-sum while the α=0.15 EMA
`#displayedMaxVol` crawls, so `(vol/maxVol)>1` clamps most bars to full band height for ~30 frames, then eases down. (
Boundary jump is ~2x, not the claimed 5-30x, but still saturates ~half the band.)
**Fix:** track `#prevDecimated`; on a transition set `this.#displayedMaxVol = rawMax` (snap, matching the setData
re-seed) instead of easing. Or store per-candle average (`volume/bucketLen`) in `decimateOHLCData` so the scale stays
continuous.

### 11. 'grow' entrance is raw-linear — constant-velocity head with a hard stop at settle

`packages/core/src/series/base-multi-layer.ts:250` returns `elapsed/entryMs`; consumed unmodified at
`line.ts:172-173,447,777-778`. The growing line head moves at constant pixel velocity then clamps to 0 at progress≥1 — a
velocity discontinuity (settling pop) on the line tip and pulse dot on every appended segment. Nothing else eases it (
appendPoint nulls the live animator).
**Fix:** wrap the consumed progress in `easeOutCubic` (already at `easing.ts:5`) at the geometry call sites (not inside
`entranceProgress`, which also feeds the fade-alpha at `line.ts:222`). Candlestick uses the same raw progress (
`candlestick.ts:379`) — apply there too for consistency.

### 12. Overlay redrawn twice per frame + full-bitmap clear every frame

> **DONE** — axis-label half in v0.4.x (DOM-label `sync` coalesced to once per animating frame, plus the `overlayChange` per-tick sync gated in v0.4.3); overlay double-draw + empty-bitmap clear + perf-attribution closed in v0.4.3 (`RenderScheduler.consume()` / `#renderFrame` / `#overlayHasContent`); see the v0.4.3 table above.

`packages/core/src/chart.ts:1989` (`renderMain` always calls `renderOverlay()`) and `canvas-manager.ts:164-176` (
unconditional full-bitmap `clearRect` before the emptiness guard at `chart.ts:2014`). During combined main+overlay
animation (streaming + pulse), both schedulers fire in the same frame → overlay cleared+repainted twice. And the overlay
clears the full bitmap every main frame even when empty. No visible artifact, but wasted paint on the hot path.
Perf-monitor also mis-attributes overlay time to the main layer (`chart.ts:307-318`).
**Fix:** add `RenderScheduler.consume()` (cancel pending rafId + clear dirty without destroy); after the synchronous
`renderOverlay()` in `renderMain`, call `#overlayScheduler.consume()` so the duplicate frame-N RAF is dropped while the
next-frame re-arm survives. Gate the empty-overlay clear behind a `#overlayHasContent` flag (clear once on the
painted→empty transition). Route the in-renderMain overlay pass through the perf wrapper.

### 13. Grid lines & crosshair render at 1 device px (0.5 CSS px) on HiDPI

`packages/core/src/components/grid.ts:31`, `crosshair.ts:13`, `edge-indicator.ts:106`. `lineWidth = 1` in bitmap space =
0.5 CSS px at DPR 2, while every series stroke scales by `pixelRatio` (candle wicks
`Math.max(1, Math.round(horizontalPixelRatio))`). Tellingly the dash patterns *are* dpr-scaled, proving the omission.
Grid/crosshair read muddy and faint vs the candles.
**Fix:** `const lw = Math.max(1, Math.round(horizontalPixelRatio)); context.lineWidth = lw;` and snap `+0.5` only when
`lw` is odd.

### 14. Axis/tick text fails WCAG contrast in nearly every preset

`packages/core/src/theme/themes/*`. Computed: oneDarkPro `#5c6370` on `#282c34` = 2.32:1; quietLight `#aaaaaa` on
`#f5f5f5` = 2.13:1; solarizedLight 2.48:1; minimalLight 2.17:1 — several below even the 3:1 UI floor for functional
price/time text.
**Fix:** darken light-theme axis colors / lighten dark ones to clear ≥3:1 (ideally 4.5:1), e.g. quietLight
`#aaaaaa→#8a8a8a`, solarizedLight `→#657b83`. Add a dev-time contrast assertion over all presets to catch regressions.

### 15. Default white yLabel text illegible on light down-candle pills

`packages/core/src/theme/create.ts:158` (`textColor ?? '#ffffff'`) + down pill = down candle base. In minimalLight the
down body `#bbbbbb` gives white-on-#bbbbbb = 1.92:1. The Y price label is a primary readout.
**Fix:** pick yLabel text color per-pill by luminance of the resolved pill background (reuse `isDarkBg`), instead of a
fixed `#ffffff`.

### 16. LTTB decimation silently collapses NaN/gap markers on large datasets

`packages/core/src/data/decimation.ts:9,72`. `getY = d.value` may be non-finite (the renderer supports gaps), but a NaN
makes the triangle `area` NaN, so `area > maxArea` is always false → the gap point is never selected and the bucket
emits a finite default; an intended break inside a bucket is dropped and the line strokes straight across the gap. Only
triggers above the decimation gate (>~1600 visible pts), but real.
**Fix:** make LTTB gap-aware — split input into finite runs on non-finite values, decimate each proportionally, re-join
with gap markers preserved; and skip non-finite samples in the avgX/avgY accumulation so a NaN can't poison the adjacent
bucket. Add a NaN-gap regression test (the suite has zero non-finite coverage).

### 17. createTheme hexToRgba returns NaN channels for shorthand/`#000`/`#fff`; isDarkBg misclassifies

`packages/core/src/theme/create.ts:65-71,263-268`. Fixed slices `[1:3]/[3:5]/[5:7]` with no length check:
`hexToRgba('#fff',0.5) === 'rgba(255, 15, NaN, 0.5)'` → poisons `tooltip.background`, `crosshair.labelBackground`,
`chartGradient`. `isDarkBg` bails to false for `length<7`, so `createTheme({background:'#000'})` builds a **light**
theme (dark text on black). Public API; the test suite passes `#000`/`#fff` but never asserts the derived strings.
**Fix:** add `expandHex` (`#abc → #aabbcc`) and normalize `bg` once at the top of `createTheme` and inside `isDarkBg`.
Fix the same fixed-slice bug in `utils/color.ts parseHex` if consolidating. Assert
`createTheme({background:'#000'}).dark === true` and no `NaN` in derived colors.

### 18. Prepending history via `setSeriesData` snaps the whole viewport instead of staying stable

`packages/core/src/data/sync.ts:37,192-236`. `syncSeriesLayer` only special-cases a tail slide/small tail growth
(`added <= BULK_THRESHOLD`, 20); any bigger prepend (e.g. `EdgeLoader`'s common "load 100 more candles" pattern)
always falls into the full-replace branch (`sync.ts:216-217`) regardless of whether the new points were prepended
(currently off-screen) or appended. `chart.setSeriesData` (`chart.ts:912-922`) then sets
`#dataReplaceSnapPending = true` (documented as a "long-standing public contract"), which routes into
`ViewportEngine.onDataReplaced` (`viewport-engine.ts:370-380`) — an **instant** `#snapX`/`y.transition.snap`, bypassing
the Hermite/spring Sticky-Y easing entirely (contrast `onPointAppended`, `viewport-engine.ts:253-277`). Worse: while
`#autoScroll` is still on (the default — only a user pan/zoom that leaves the live tail turns it off,
`pan-zoom-math.ts:171-183`), `#computeXTarget`'s only guard before a full re-fit is `if (!this.#autoScroll) return
null;` (`chart.ts:2176`) — there is no check for "the host already has an explicit visible range." So a bulk prepend
re-fits the *entire* (now much larger) data span into view and snaps both axes instantly, even though the currently
visible candles' values never changed. Compounding it: bulk re-seeds of a non-empty series never replay entrance/intro
animation by design, so the newly prepended candles also pop in at full opacity with zero reveal. Net effect (found
dogfooding the `use-cases/data-loading` EdgeLoader demo): "new data appears instantly and everything jumps" — reported
as the most painful part of the load-more-on-scroll flow.
**Fix:** needs a real prepend-aware path, not a demo-level workaround (`chart.setVisibleRange()` re-assert after the
fact only patches the symptom in one call site). Options: (a) give `syncSeriesLayer` a genuine "N items added to the
front, existing suffix untouched" recognition that updates `#dataStart` without flipping `#dataReplaceSnapPending`;
(b) make `#computeXTarget`'s re-fit conditional on whether the host has an explicit `visibleRange`/`initialRange`
already committed, not just `#autoScroll`; (c) at minimum, let a prepend keep the *eased* transition path instead of
the instant snap. No public `prependData`/`addHistory` method exists today — every accumulation strategy for
"load more history" funnels through the same disruptive `setSeriesData` bulk-replace call.

## P2 — polish & code-quality

- **Crosshair-dot glow built by string concat** breaks on shorthand/8-digit hex/hsl (`line.ts:675-680`). The sibling
  `drawPulse` uses `hexToRgba` correctly. **Fix:** set the halo via `ctx.globalAlpha *= 0.25` + solid
  `fillStyle = color` (format-agnostic, no parsing) — `hexToRgba` alone regresses hsl and still NaNs shorthand.
- **Crosshair time pill uses raw `dataInterval`** not the resolved tick interval (`react/src/ui/Crosshair.tsx:57`), so a
  time-of-day badge floats among date axis labels when zoomed out. **Fix:** pass
  `chart.timeScale.niceTickValues(dataInterval).tickInterval`. (Also affects Vue/Svelte.) — **DONE (v0.4.2):** Vue/Svelte
  `Crosshair` pills now resolve the tick interval (`niceTickValues(dataInterval).tickInterval || dataInterval`); React
  already had it.
- **Axis label text-pops (no fade) across the 12h↔1day tier boundary** for a surviving midnight tick (
  `dom-labels.ts:108-110`). **Fix:** treat a surviving tick whose formatted text changes as exit+enter pair /
  cross-fade. (Day↔year case from the claim is not reliably reachable.)
- **Bar zero-line stroke is hairline-thin at HiDPI** (`bar.ts:287-295`, `lineWidth=1` in bitmap space). Scale to dpr
  like the wicks.
- **Per-candle per-frame `createLinearGradient`** in the body loop (`candlestick.ts:672-679`) — cache by quantized
  height bucket + `translate`, or build one full-height gradient and clip. — **DONE (v0.4.3):** cached by
  `(colors, quantized height)` + `translate`.
- **Vue Crosshair / Svelte Crosshair theme is non-reactive** (
  `vue/src/ui/Crosshair.vue:11 computed(() => chart.getTheme())`) — label colors lag a runtime theme swap. **Fix:**
  drive from `useTheme()` reactive ref (the sibling Tooltip/PieTooltip already guard this). — **DONE (v0.4.2):** both
  `Crosshair` components now subscribe to `overlayChange` and read a `bump` in the theme computed, so label colors track
  a runtime `setTheme` (same guard Tooltip/PieTooltip use).
- **Vue/Svelte useLastYValue/createLastYValue drop React's pixel-Y tracking** (`vue/src/composables.ts:28`,
  `svelte/src/stores.ts:26`) — a consumer-positioned badge freezes on pan/zoom/resize when value is unchanged. Built-in
  YLabel unaffected. **Fix:** capture `chart.yScale.valueToY(value)` and re-emit on pixel-Y drift. — **DONE (v0.4.2):**
  both now track `yScale.valueToY(value)` and re-emit on pixel-Y drift; the early-return guard preserves identity when
  neither value nor pixel moved.
- **Navigator perf**: full-dataset re-decimation every frame (`controller.ts:466-487`), canvas backing-store reallocated
  every frame (`controller.ts:419-422`), two O(N) scans + forced `getBoundingClientRect` per hover mousemove (
  `controller.ts:361-368`). **Fix:** cache decimated arrays by `(data ref, buckets)`; guard the dimension write; cache
  xRange/yRange/rect. — **DONE (v0.4.3)** for the per-frame path: render split (animation frames are DOM-only),
  decimation memoized, dimension writes guarded. Hover-scan/rect caching left as-is (event-rate, not frame-rate).
- **Navigator brush-drag flips autoScroll mid-gesture** via `setVisibleRange({from,to})` (`controller.ts:394` →
  `chart.ts:826`); a stream tick landing while it's momentarily true fights the drag. **Fix:** pin autoScroll for the
  gesture / pause cadence while `#drag !== null`; only re-derive on pointerup.
- **Duplicated `easeOutCubic`** (`animation/easing.ts:5` and `utils/math.ts:22`) and **three divergent lighten
  implementations** (`create.ts:270`, `pie.ts:166`, `utils/color.ts:26`); the additive form hue-shifts the candle
  auto-gradient. Consolidate. — **DONE (v0.4.x):** `easeOutCubic` single in `animation/easing.ts`; `lighten` single in
  `utils/color.ts` (blend-toward-white), `lightenHex`/`lightenColor` delegate, additive hue-shift gone.
- **Dead code**: navigator `renderWindow` (`render.ts:200-234`, controller uses DOM overlay), dead `setXThreshold` (
  `viewport-engine.ts:211-219`), vestigial navigator `#dirty` flag (`controller.ts:279-289`), inside-label
  `#labelReveal` reset is dead work for inside mode (`pie.ts:271`). Remove (delete the `renderWindow` test block too —
  it's the sole caller). — **DONE (v0.4.x):** `renderWindow` (+ test block) and `setXThreshold` (+ the dead
  `#x.threshold` field & `#retargetX` filter branch) removed. **v0.4.3:** `#dirty` is no longer vestigial — it selects
  full-render vs window-only frames. Still open: `#labelReveal` reset.
- **No tab-visibility handling in core** (`render-scheduler.ts:12-16`) — persistent pulse/edge ticks keep re-arming
  while hidden. No snap-back (duration-clamped animator), so efficiency-only. Optionally gate self-perpetuating ticks on
  `document.hidden`. — **DONE (v0.4.3):** RAF re-arm gated on `document.hidden`, owed frame fires on the visible flip.
- **appendData+keepLast triggers two onDataChanged passes per tick** (`base-multi-layer.ts:146,197`). Add a batched
  `store.appendAndTrim`. — **DONE (v0.4.3):** via `chart.batch()` in `syncSeriesLayer` (no new store API).
- **Pie polish**: no slice sweep-in entrance (only labels reveal, `pie.ts:853-954`); hover-lift shadow scales as
  offset² (`pie.ts:944-945`, drop the extra `hoverAlpha` on the offset term); setData resets explode offsets + label
  reveal on every update (`pie.ts:265-276`, breaks live/animated pies — preserve offsets, gate reveal reset on
  first-data).
- **Spring settle-time docs inaccurate**: ω = 4.6/settleSec leaves ~5.6% remaining at settleMs (
  `visible-range-spring.ts:79`, `y-range-spring.ts:82`), not the documented ~99%. Correct the JSDoc (or use ω≈6.64) and
  note Hermite lands at the deadline while the spring is asymptotic.
- **EdgeLoader & Sparkline are React-only** — no Vue/Svelte equivalents (feature-parity gap; the EdgeLoader teardown is
  leak-prone to hand-roll).
- **Tick-tier gap 90d→1yr** forces a ~4x density jump (`utils/time.ts:67`); add a 180d tier. Day/month ticks **omit the
  year** (`time.ts:44`) — ambiguous across year boundaries.
- **Area-fill gradient banding** on tall canvases (2-stop 0.12→0.01, `line.ts:310-313`) and *
  *`theme.line.areaTopColor/areaBottomColor` are dead** on the main plot (renderer hardcodes 0.12; only the navigator
  honors them). Plumb the theme fields in (extend the gradient cache key) and anchor the gradient to the painted region.
- **Default `seriesColors` fallback is only 3 colors** and wraps (`create.ts:136`) — a 4th series reuses the gain/loss
  semantic colors. Ship a fuller default ramp.

## Animation smoothness — focused assessment

The architecture is sound and most of the smoothness story is already premium: the X spring (`VisibleRangeSpring`) and Y
autoscale (`YRangeSpring`/`YRangeHermite`) are analytic closed-forms sampled at absolute time, frame-rate-independent,
velocity-continuous across mid-flight retargets and ω changes, with NaN guards and all-equal/single-point handling. The
sticky-Y EMA-on-contract (α=0.05) and separate X/Y animators are validated and should stay.

The real smoothness defects, in impact order:

1. **Default-Y velocity-carry overshoot (P0 #1)** — the one that bites ordinary streaming. The default Hermite carries
   adverse `v0` into a long contract segment and balloons the bound outward before settling. The fix is local (
   direction-project the carried velocity) and orthogonal to sticky-Y.

2. **Live-value chase still kicks (P1 #8)** — the per-point OHLC/line value tween never got the spring treatment; it
   restarts easeOutCubic on every sub-`smoothMs` tick. Invisible in the shipped docs (500ms throttle), visible on 100ms
   trading feeds.

3. **Navigator/canvas X desync (P1 #9)** — window snaps to target while canvas eases, on every wheel/pan. Pure
   consumer-side fix reusing the existing `tickFrame` mechanism.

4. **Raw-linear entrance hard-stop (P1 #11)** — constant-velocity head stopping dead on every appended segment; a
   one-line ease-out fix.

### The 32ms stress-page micro-shake

This is **disputed** between verifiers and the diagnosis matters. The original "retarget at producer wall-time, sampled
at RAF time" claim's *mechanism* is wrong: `VisibleRangeSpring` is provably C¹-continuous across retargets (verified —
velocity is identical immediately before/after), so RAF sampling introduces **no velocity discontinuity**, and the
proposed "phase-lock #t0 to the RAF clock" fix is neutral-to-regressive in simulation (it aliases +1-bar steps onto the
RAF beat). What is real: the spring is fed an **irregular discrete +1-bar step-input train** arriving ~every 2 RAF
frames at `settle=200` (floored), and at 32ms the residue is the observed sub-pixel shake.

**Recommended fix** (validated by Monte-Carlo simulation of the actual spring math): raise the *effective X settle
floor* for sub-100ms cadences — raising settle from 200ms toward 400–600ms cut frame-to-frame velocity std-dev roughly
in half (3.15 → 1.45 bars/s). The cadence already targets `ema*3` but is clamped UP to 200 only when `ema*3 < 200`;
widening the floor/slack for fast feeds keeps the spring further from rest between ticks so the step input reads as
continuous glide. Orthogonally, coalescing multiple appends per RAF (one retarget per frame) regularizes the step
train — but that is "how many bars land per frame," not "which timestamp seeds #t0." Do **not** implement the per-tick
RAF-`#t0` rewrite.

Secondary, lower-impact: the cadence EMA α=0.3 (`streaming-cadence.ts:19`) feeds a jittery settle (hence ω) into the
spring every tick for 67ms–1.6s feeds — a sub-pixel second-order ripple. Quantize the pushed settle (round to 25ms, only
call `setXSettleMs` on a step crossing) rather than lowering α. The per-side ω expand/contract flip on a contested
extreme (`y-range-spring.ts:105`) is the same class — a small directional deadband fixes it but the dominant motion
there is the spring chasing a raw, unsmoothed extreme.

## Visualization correctness — focused assessment

Rendering is generally correct: candle wick/body parity and pixel-snapping are carefully done (
`candlestick.ts:402-408`), DPR backing-store sizing is correct, tick hysteresis prevents density flicker, and the line
renderer's NaN-gap handling is robust at normal scale. The genuine correctness defects:

- **Pie negative/NaN values (P0 #2)** — total/angle/percent corruption, the most severe.
- **LTTB drops NaN gaps (P1 #16)** — solid line strokes across intended breaks on large datasets.
- **Volume-band saturation across the decimation boundary (P1 #10)** — ~30-frame full-height clamp.
- **Vue/Svelte rolling-window candlestick (P1 #7)** — stale/incorrect window (an actual data bug, not just smoothness).
- **HiDPI hairlines (P1 #13, P2 bar zero-line, navigator mini-series)** — consistently 1-device-px where everything else
  scales by dpr.
- **WCAG contrast (P1 #14, #15)** — axis/yLabel text below legibility floors across most presets.
- **Theme color-math (P1 #17)** — NaN channels and dark/light misclassification on shorthand/`#000`/`#fff`.

The React rolling-window single-step assumption (`CandlestickSeries.tsx:68-70`) drops interior points when two ticks
coalesce into one commit (stress page / tab-resume / main-thread jank). **Fix:** append every tail point newer than
`prevLast` (not just `data[length-1]`), then `keepLast` — degrades to the fast path for the single-step case. Apply to
Line/Bar too.

## Disputed / needs human judgment

- **32ms micro-shake** — see above. Verifiers split on mechanism and on whether the RAF-`#t0` fix helps. Recommendation:
  pursue the X settle-floor / per-RAF coalescing path; reject the `#t0`-from-RAF rewrite. Validate empirically (
  per-frame sampled X velocity variance) since the improvement is subtle. This overlaps the in-flight ViewportEngine
  refactor.
- **Asymmetric expand/contract two-stage settle** (`y-range-hermite.ts:138-146`) — one verifier flagged it; the other
  showed `#contractMs` magnitude-scaling already floors small receders at 500ms (gap is ~2x not 10x), and the full
  2500ms only fires on a large outlier scroll-off, which is the *intended* sticky-Y hold. **Do not symmetrize** (would
  break validated sticky-Y). At most document the intent; verify visually whether a lone receding edge reads as a stuck
  label before any change.
- **Per-tick ω expand/contract flip** (`y-range-spring.ts:105`) — real mechanism, but isolated ω-flip contribution is
  sub-pixel and masked by the spring tracking a raw oscillating extreme. Low-value polish (deadband) at most.
- **First-retarget `#cached` not seeded / first-paint Y sweep-from-zero** (`visible-range-spring.ts:81-87`,
  `y-range-hermite.ts:84-91`) — one verifier marked the X case a false-positive (snap-first init makes the branch
  unreachable on the happy path). It's a real contract-tightening for the reachable visibility-toggle-before-data edge.
  Low. Seed `#x0`/`#cached` in the first-retarget branch.
- Several runtime-impact verifiers downgraded items to false-positive on the runtime lens that the correctness lens
  kept (overlay double-draw, empty-overlay clear, LTTB streaming shimmer, decimateLinear 2x points, hermite `animating`
  getter). Treated as low/polish above where the correctness lens confirmed the code fact.

## Repo health

- **typecheck**: clean (`tsc --noEmit`, no errors).
- **tests**: 141 files / 1284 tests pass (13.5s); two expected stderr lines are intentional test scenarios. Coverage
  gaps worth closing alongside fixes: cursor-anchor zoom test (`chart-zoom-historical.test.ts:103-117`) derives
  cursorTime from `getVisibleRange()` and freezes the clock, so it can never exercise the in-flight visual/logical
  drift — add a mid-flight RAF case; no non-finite coverage for LTTB or pie; no multi-step-coalesce test for the React
  rolling window; no Vue/Svelte streaming-append parity test.
- **lint**: FAILS — Biome reports 2861 errors / 2221 warnings across 416 files, but the bulk is formatter/import-sort
  noise in `docs/`. Two real config/code items: `biome.json:5-9` uses deprecated `/**`-suffix ignore patterns (5
  fixable, Biome ≥2.2.0), and `docs/components/playground/styles.css:378` `noDescendingSpecificity`. Run
  `biome check --write` on the docs tree and fix the `biome.json` ignore patterns to get a clean signal.

---

# Jaw-Drop Visual & Motion Roadmap

## Vision

World-class for this library means the chart reads as a living instrument, not a redrawn picture. Picture Apple Stocks'
calm confidence fused with TradingView's information density and Linear's motion discipline: every pixel is crisp at any
DPR, every transition has a single coherent physics, and nothing ever "pops." On first mount a line should draw itself
on like ink flowing left-to-right, its area fill blooming up behind the stroke, then settle into a quiet breathing pulse
at the live tip. Streaming ticks glide in on the already-validated X-spring/Y-hermite engine with zero micro-shake; the
active line carries a soft luminous glow so the eye always knows where "now" is. The crosshair should feel magnetic and
weightless — fading in, snapping to data points, its axis pills sliding rather than teleporting. The last-value pill is
the chart's heartbeat: a directional, glowing capsule whose digits roll (NumberFlow already exists) and whose color is
the same accent as the line's glow, so the whole composition is monochromatically cohesive per theme. Candles get subtle
vertical depth and a faint top-edge sheen; bars get a gradient and rounded caps; the pie (already the most polished
surface here) becomes the design north star the other series are leveled up to match. The signature dark theme ("
Aurora") should feel like a premium trading terminal at midnight — deep near-black with a single saturated accent, a
barely-perceptible chart-area vignette, and a grid that's felt more than seen. The result: a viewer's first reaction
is "wait, is this real-time?" followed by "this feels expensive."

## Top 3 (highest jaw-drop per effort)

1. Soft glow on the active line + last-value tip (line.ts:264-276 extra shadowed stroke pass; richer radial-gradient
   drawPulse at line.ts:796-836) — S effort, highest 'expensive' payoff, and it's the visual hook the signature theme is
   built around.
2. First-mount draw-on reveal for line + area bloom (gate renderOff at line.ts:178-332 with a clip-rect reveal progress
   driven off a setData startTime) — M effort, owns the critical first-400ms 'is this alive?' impression that's
   currently a static pop.
3. Fix the dead area-fill theme colors + 3-stop gradient (line.ts:310-313 currently ignores
   theme.line.areaTopColor/areaBottomColor) — S effort, fixes a latent bug AND upgrades every area chart to a premium
   falloff for free, and unlocks per-theme cohesion for the Aurora signature theme.

## All upgrades

### 1. First-mount draw-on reveal for line + area bloom

`area:entrance` · **impact:** high · **effort:** M

**What:** Today setData (the common first-paint path) clears all entrance entries (base-multi-layer.ts:124-138;
candlestick.ts:135-149), so a freshly-mounted line just appears whole — only streaming appendPoint animates. Add an
opt-in `revealMs` first-paint pass: in LineRenderer.renderOff (line.ts:178-332) gate the polyline/area draw by a global
reveal progress p∈[0,1] driven off a single startTime stamped in setData when the store goes from empty→populated. Clip
the draw to a rect of width `chartWidth*easeOutCubic(p)` (reuse easeOutCubic from easing.ts:5) so the stroke 'draws on'
L→R, and ramp area-fill globalAlpha 0→1 trailing ~120ms behind the stroke head so the fill blooms up after the line
passes. Drive frames via the existing needsAnimation/markDirty path. Candlestick gets the analogue: stagger per-candle
entry startTimes by index (a 'cascade' instead of all-at-once) so candles ripple in L→R.

**Why:** The single biggest 'is this alive?' moment happens in the first 400ms a viewer sees the chart, and right now
that moment is a static pop. A draw-on reveal is the canonical premium-charting first impression (Apple Stocks,
Robinhood) and it's nearly free because the animation engine, dirty-frame scheduling, and easing primitives already
exist.

### 2. Soft glow on the active line + last-value tip

`area:color` · **impact:** high · **effort:** S

**What:** In LineRenderer.renderOff (line.ts:264-276) before the final stroke, do a single extra pass: set
ctx.shadowColor = hexToRgba(color, 0.45), ctx.shadowBlur = 6*verticalPixelRatio, stroke the SAME path once, then clear
shadow and stroke the crisp line on top. Gate behind an option (default on for dark themes via theme.dark, off for light
to avoid muddiness) and skip when decimated/strokeWidth tiny. Also enrich drawPulse (line.ts:796-836): the current halo
is a flat 0.3-alpha disk; replace with a 2-stop radialGradient (center color@0.5 → transparent) for a true bloom, and
add a thin bright core ring. The pulse already breathes via Math.abs(sin(phase·2π)) — keep that, it's
frame-rate-independent.

**Why:** A glow on the leading edge is the cheapest, highest-impact 'expensive' signal — it draws the eye to the live
value and makes the line feel emissive rather than printed. One extra stroke pass per frame is negligible vs the rest of
the draw, and shadowBlur is GPU-accelerated in modern canvas.

### 3. Make the line area-fill honor theme colors + richer gradient

`area:color` · **impact:** high · **effort:** S

**What:** BUG-ADJACENT: line.ts:310-313 hardcodes the area gradient as hexToRgba(color,0.12)→hexToRgba(color,0.01) and
never reads theme.line.areaTopColor / areaBottomColor — those theme fields (theme/types.ts:60-64, create.ts:133-134) are
completely dead for the line series. Thread the theme's area colors into SeriesRenderContext (or applyTheme) and use
them as the gradient stops, falling back to the derived alpha ramp. While there, add a 3rd stop: top@~0.18, mid(45%)@~
0.06, bottom@0.00 for a more natural falloff than the current near-linear 0.12→0.01, and key the gradient cache (
line.ts:53,305-314) on the new colors so it still hits.

**Why:** Theme authors set areaTopColor/areaBottomColor expecting them to work; silently ignoring them is both a latent
bug and a missed cohesion lever. A 3-stop gradient with theme-driven color is what separates a 'filled line' from a '
premium area chart' and costs nothing at runtime (cached).

### 4. Crosshair: fade-in, intersection dot, and magnet snap

`area:crosshair` · **impact:** high · **effort:** M

**What:** renderCrosshair (components/crosshair.ts) is a bare dashed cross drawn/erased instantly. (1) Fade: track a
crosshair-alpha animator in the overlay loop (chart.ts:2011-2032) so the cross ramps 0→1 over ~120ms on enter and 1→0 on
leave instead of hard cut. (2) Intersection accent: draw a small filled dot where the hairlines cross, in
theme.crosshair.color at higher alpha. (3) Magnet: add an optional snap mode in setCrosshair (chart.ts:866-901) that,
when enabled, replaces the free `time` with the nearest data point's time (renderers already expose findNearest, used in
line.ts:626) so the vertical hairline locks to candles/points — the TradingView 'magnet' feel. The axis pills (
Crosshair.tsx) should get `transition: transform 80ms` so they slide along the axis instead of teleporting.

**Why:** The crosshair is the most-touched interactive surface; a hard on/off cut is the clearest 'cheap' tell. Fade +
magnet + a slid pill is the difference between a debug overlay and a polished cursor. All hooks (overlay scheduler,
findNearest, animator) already exist.

### 5. Last-value pill: directional glow capsule synced to line accent

`area:edge-indicators` · **impact:** high · **effort:** M

**What:** YLabel.tsx:130-166 renders a flat 3px-radius pill + 0.5-opacity dashed line, transitioning only
background-color/0.3s. Upgrade to a fully-rounded capsule (borderRadius: 999) with a directional left-edge arrow notch
pointing at its row, a soft box-shadow tinted by bgColor (`0 0 12px ${bgColor}55`) so it glows in the line's accent, and
a tiny ▲/▼ glyph for direction. Animate vertical movement: add `transition: top 120ms cubic-bezier(.22,.61,.36,1)` so on
streaming ticks the pill glides to its new Y instead of jumping (it currently re-renders on viewportChange at the raw
yScale.valueToY). The digit roll via NumberFlow (already wired, line 163) stays. Make the dashed connector line animate
its dash offset slowly for a subtle 'live wire' feel.

**Why:** The pill is where the eye rests between glances — it's the chart's headline number. A glowing, gliding,
directional capsule that shares the line's accent color unifies the whole composition and reads as a finished product.
It's DOM/CSS-only, so zero canvas-perf cost and no risk to the animation engine.

### 6. Candle depth: top-edge sheen + wick anti-alias polish

`area:candle-depth` · **impact:** medium · **effort:** M

**What:** drawCandles (candlestick.ts:632-684) already supports a 2-stop body gradient via autoGradient. Add two
refinements: (1) a 1px lighter top-edge highlight line on each body (stroke the top edge in lightenHex(topColor, 0.15))
for a subtle 3D bevel — only when bodyHeight>3 to avoid clutter. (2) Optionally a faint per-body drop shadow (
shadowBlur ~2px, low alpha) gated behind a `depth` theme/option flag, matching the pie's existing shadow vocabulary (
pie.ts:942-948). Keep the validated body/wick parity math (candlestick.ts:401-408) untouched. Also consider rounding
body corners by ~1px via roundRect when barWidth is large enough.

**Why:** Candles are the flagship financial primitive; flat rectangles read as 'chart library default'. A top sheen +
optional depth gives the tactile, physical quality that makes a candlestick chart feel premium, while reusing the shadow
idiom the pie already proves looks good here.

### 7. Bar series: vertical gradient + rounded caps

`area:color` · **impact:** medium · **effort:** S

**What:** bar.ts:451-453 (fillBar) and drawAnimatedBar (461-476) paint flat fillRect. Replace with a cached vertical
gradient (top = color, bottom = darkenHex(color,0.12) or hexToRgba(color,0.85)) and round the top two corners via
ctx.roundRect when bar width permits, falling back to fillRect for sub-3px bars. Cache the gradient per (color,height)
like the line does (line.ts:53).

**Why:** Bars are currently the least-polished series (the pie is the most). A gradient + rounded caps is a tiny change
that brings bars up to the visual tier of the rest of the library and matches modern dashboard aesthetics.

### 8. Signature theme 'Aurora' — premium midnight terminal

`area:theme` · **impact:** high · **effort:** S

**What:** Add a flagship preset (packages/core/src/theme/themes/aurora.ts) and register it first in docs/themes.ts. Deep
near-black background (~#0A0E14), a single saturated accent (electric indigo/cyan ~#5B8DEF or #2DD4BF) used for line +
glow + up-candle + neutral pill, a desaturated rose for down, grid at ~rgba accent@0.04 (felt not seen), and a
stronger-than-default chartGradient vignette (createTheme already supports chartGradient, create.ts:106-107). Pair with
the glow upgrades so the accent appears in the line glow, pulse, and pill shadow — one accent threaded through every
surface. Use the Outfit/Geist font (already available, create.ts:322).

**Why:** Every great charting product has ONE signature look that screenshots well and anchors the brand (TradingView
dark, Linear's purple). The theme system already derives 90% of this from a single accent + bg; a curated, glow-aware
preset turns the new motion/color work into an instantly recognizable identity for marketing and docs hero shots.

### 9. Streaming-in micro-entrance for the newest point

`area:streaming` · **impact:** medium · **effort:** S

**What:** The line's trailingEndpoint (line.ts:138-175) already lerps the new segment in on 'grow'. Add a brief
scale-up 'ping' on the pulse dot the instant a new point lands: stamp a per-append timestamp and for ~180ms after
append, multiply the pulse glowRadius by an easeOut overshoot (e.g. 1 + 0.6*(1-p)) in drawPulse (line.ts:815-817). This
is a frame-rate-independent decay off wall-clock, so it stays smooth regardless of tick cadence. Do NOT touch the
X-pan/data-append cadence (the known micro-shake area) — this is purely a visual flourish on the already-positioned dot.

**Why:** A subtle 'heartbeat ping' the moment data arrives makes streaming feel responsive and alive without adding a
new RAF or coupling to the tick<->RAF timing that's the known shake source. Pure decorative decay, no engine risk.

### 10. Grid + chart-area vignette cohesion

`area:theme` · **impact:** low · **effort:** S

**What:** renderGrid (components/grid.ts) already fades ticks via tickTracker opacity — good. The chartGradient vignette
is currently applied via CSS on the container (chart.ts:1866 comment) rather than on the canvas, which means it sits
BEHIND the area fill rather than compositing with it. Consider painting a very subtle radial/linear vignette on the main
layer before series so depth reads consistently with the on-canvas glow, OR at minimum tune default chartGradient deltas
in create.ts:107 (currently lighten 0.04 / darken 0.06) to be slightly stronger on dark themes for more perceived depth.

**Why:** Cohesion: when glow and gradients live on the canvas but the vignette lives in CSS, the depth cues can disagree
at the edges. Unifying them (or just deepening the dark-theme vignette) is a low-effort polish that makes the plot feel
like it has real atmosphere.

--- 

## Quick wins (highest value-per-effort)

1. Project carried Y velocity onto travel direction in y-range-hermite.ts:93-100 retarget (zero adverse v0) — kills the
   default-curve streaming overshoot, ~4 lines
2. Add easeOutCubic to the grow-entrance progress at line.ts:172-173/447/777-778 and candlestick.ts:379 — removes the
   line-tip settling pop
3. Handle the 2→1 finger transition in handler.ts onTouchEnd (re-seed pan) — fixes a hard dead-gesture bug
4. Switch pinch distance to Math.hypot(dx,dy) + clamp factor in handler.ts:94/105 — fixes erratic/Infinity pinch zoom
5. Add #sliceValue finite-and-positive sanitizer in pie.ts and route total/angle/percent through it — fixes negative+NaN
   corruption in one pass
6. Scale grid/crosshair lineWidth by pixelRatio in grid.ts:31 / crosshair.ts:13 — crisp HiDPI hairlines
7. Normalize shorthand/expandHex bg at top of createTheme + isDarkBg (create.ts:65,263) — fixes NaN colors and
   #000-as-light misclassification
8. Track #prevDecimated and snap #displayedMaxVol on the boundary frame (candlestick.ts:519) — removes the ~30-frame
   volume saturation
9. Replace the crosshair glow color concat with ctx.globalAlpha (line.ts:675-680) — fixes broken halo on non-6-digit/hsl
   colors
10. Pass niceTickValues(dataInterval).tickInterval to the crosshair time pill (Crosshair.tsx:57) — pill granularity
    matches axis labels

---

## Review method

Generated by a 13-reviewer multi-agent workflow (13 dimensions, 99 raw findings → 78 confirmed after adversarial
verification; 21 dropped as false-positive, 9 disputed). Each bug/smoothness finding was checked by two independent
verifiers (correctness lens + runtime-impact lens).
