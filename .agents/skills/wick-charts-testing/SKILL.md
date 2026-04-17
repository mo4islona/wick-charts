---
name: wick-charts-testing
description: Write tests for the Wick Charts repo (core renderers, React integration, Vue/Svelte wrappers). Use when adding *.test.ts(x) files, covering regressions, or extending the recording-context spy infrastructure. Detect by the user editing a test file in `packages/*/src/__tests__/**` or asking to "cover X with a test", "add a regression test", "test this bug".
---

# Wick Charts testing

Tests assert on **what/where/in-what-order** the code draws, not the resulting pixels. The `CanvasRecorder` spy wraps `CanvasRenderingContext2D` so every call lands as an inspectable record.

For concrete templates, spy API details, and gotchas, read `context.md` after choosing a layer.

## Layers

Every test belongs to exactly one layer. Pick by the object under test:

| Layer | When | Location |
|---|---|---|
| **Renderer unit** | One series renderer in isolation — no ChartInstance, no DOM | `packages/core/src/__tests__/renderers/*.test.ts` |
| **Math / scales / viewport** | Pure math (zoom, pan, clamping, stacking, scale sync) | `packages/core/src/__tests__/*.test.ts` (flat) |
| **Interaction handler** | Wheel / mouse / touch → viewport.pan/zoom calls | `packages/core/src/__tests__/*-handler.test.ts` |
| **React integration** | Regression class or full component-level behavior | `packages/react/src/__tests__/integration/*.test.tsx` |
| **React component** | A single overlay component (Legend, Tooltip, YAxis, …) | `packages/react/src/__tests__/components/*.test.tsx` |
| **Wrapper smoke** | Vue or Svelte wrapper compiles and mounts | `packages/{vue,svelte}/src/__tests__/smoke.test.ts` |

## Decision matrix

Match the user's ask to a layer before writing:

- Bug that appears when two features interact → React integration (e.g. `visibility-batch.test.tsx`).
- Drawing wrong primitive for one series type → renderer unit (e.g. `renderers/bar.test.ts`).
- Off-by-one in zoom/pan math → math/scales tests, not integration — isolate the arithmetic.
- Wheel on Y-axis still zooms → interaction handler test (e.g. `zoom-handler.test.ts` — see plan).
- Vue/Svelte breakage after a core refactor → wrapper smoke.

## Non-goals

- No pixel snapshots. If your assertion reads bytes out of a canvas, you're in the wrong test layer.
- No animation-frame timing tests. The scheduler runs under a fake RAF helper; test state after flush, not frames in progress.
- No cross-browser assertions. jsdom/happy-dom only.
- No perf budgets.
- For wrappers (Vue/Svelte), don't duplicate React feature coverage — only test `mount/update/unmount` flows.

## Mount & flush

- React: use `mountChart(children, opts?)` from `packages/react/src/__tests__/helpers/mount-chart.tsx`. It returns `{ chart, mainSpy, overlaySpy, flushScheduler, dispatchWheel, triggerResize, rerender, unmount, ... }`.
- Core: use `createFakeCanvas(w, h)` + `createRecordingContext()` directly. No React, no DOM.
- Vue/Svelte: the wrapper smoke files have self-contained setup — copy from them when adding new smoke tests.

## `context.md`

Read `context.md` in this skill when you need:

- The full `CanvasRecorder` API (all query methods + examples).
- Copy-paste templates for each layer.
- The 7-regression-class map (commit hash → which test file guards it).
- Common gotchas (RAF install, ResizeObserver trigger, WheelEvent construction, cleanup between tests).

## When invoked

1. Identify the layer from the user's ask.
2. Open an existing file in that layer as a reference pattern — don't reinvent the harness.
3. Read `context.md` for the template + spy API.
4. Write the test. Keep descriptions behavior-focused ("zooms around cursor time", not "Phase N test").
5. Run `pnpm test -- --run <path>` after writing. Any failure means the assertion is wrong *or* the production code is wrong — both are worth reporting.
