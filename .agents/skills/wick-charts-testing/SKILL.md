---
name: wick-charts-testing
description: Write tests for the Wick Charts repo (core renderers and ChartInstance, React integration, Vue/Svelte wrappers). Use when adding *.test.ts(x) files, covering regressions, or extending the recording-context spy infrastructure. Detect by the user editing a test file in `packages/*/src/__tests__/**` or asking to "cover X with a test", "add a regression test", "test this bug".
metadata:
  internal: true
---

# Wick Charts testing

Tests assert on **what/where/in-what-order** the code draws, not the resulting pixels. The `CanvasRecorder` spy (`packages/core/src/testing/recording-context.ts`) wraps `CanvasRenderingContext2D` so every call lands as an inspectable record. `packages/react/test-setup.ts` attaches one to every canvas in every test (`canvas.__spy`).

For templates, the spy API and gotchas, read `context.md` after choosing a layer.

## Layers

Every test belongs to exactly one layer. Pick by the object under test:

| Layer | When | Location |
|---|---|---|
| **Renderer unit** | One series renderer in isolation — no ChartInstance, no DOM | `packages/core/src/__tests__/renderers/*.test.ts` |
| **Chart (core)** | `ChartInstance` behavior: viewport, streaming, axes, scales, events, annotations | `packages/core/src/__tests__/chart-*.test.ts` |
| **Math / scales** | Pure math (zoom, pan, clamping, stacking, scale ticks) | `packages/core/src/__tests__/*.test.ts` (flat) |
| **Interaction handler** | Wheel / mouse / touch → viewport pan/zoom calls | `packages/core/src/__tests__/*-handler.test.ts`, `interaction-handler-*.test.ts` |
| **React integration** | Two features interacting through the component tree, or a regression class | `packages/react/src/__tests__/integration/*.test.tsx` |
| **React component** | A single overlay component (Legend, Tooltip, YAxis, …) | `packages/react/src/__tests__/components/*.test.tsx` |
| **Vue / Svelte wrapper** | The wrapper's own plumbing: mount / update / unmount, props, slots, parity with React | `packages/{vue,svelte}/src/__tests__/*.test.ts` (Svelte via a `*Harness.svelte`) |

## Decision matrix

Match the user's ask to a layer before writing:

- `ChartInstance` does the wrong thing with no framework involved → chart (core), e.g. `chart-set-visible-range.test.ts`.
- Bug that appears when two features interact in React → React integration (e.g. `visibility-batch.test.tsx`).
- Drawing wrong primitive for one series type → renderer unit (e.g. `renderers/bar.test.ts`).
- Off-by-one in zoom/pan math → math tests, not integration — isolate the arithmetic.
- Wheel on the Y axis still zooms → interaction handler test (`zoom-handler.test.ts`).
- A Vue or Svelte prop, slot or callback does not reach core, or differs from React → wrapper test (`tooltip-parity`, `legend`, `marker`, …).

## Non-goals

- No pixel snapshots. If your assertion reads bytes out of a canvas, you're in the wrong test layer.
- No real-time animation tests. Drive frames with a fake RAF and assert on the state after a flush (or after one stepped frame).
- No cross-browser assertions. happy-dom / jsdom only.
- No perf budgets.
- Vue / Svelte tests check the wrapper, not core behavior again: a core rule belongs in a core test, once.

## Mount & flush

- React: `mountChart(children, opts?)` from `packages/react/src/__tests__/helpers/mount-chart.tsx` returns `{ chart, mainSpy, overlaySpy, flushScheduler, dispatchWheel, triggerResize, rerender, unmount, ... }`.
- Chart (core): `makeChartContainer()` + `installRaf()` from `packages/core/src/__tests__/helpers/fake-raf.ts`, then `new ChartInstance(container, options)`.
- Renderer: `buildRenderContext(opts?)` from `packages/core/src/__tests__/helpers/render-context.ts` returns `{ ctx, spy, overlayCtx }` — scales, theme and a recording context, no DOM.
- Vue / Svelte: copy the setup of the nearest existing test in that package.

## When invoked

1. Identify the layer from the user's ask.
2. Open an existing file in that layer as a reference pattern — don't reinvent the harness.
3. Read `context.md` for the template + spy API.
4. Write the test. Keep descriptions behavior-focused ("zooms around cursor time", not "Phase N test"). Follow the repo code rules: no `any`, no `!`.
5. Run `pnpm test <path>` after writing. Any failure means the assertion is wrong *or* the production code is wrong — both are worth reporting.
