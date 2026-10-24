# Wick Charts testing — templates, spy API, gotchas

## CanvasRecorder

Defined in `packages/core/src/testing/recording-context.ts` (also the public `@wick-charts/react/testing` entry). Where a test gets one:

- Renderer tests: `buildRenderContext()` (`packages/core/src/__tests__/helpers/render-context.ts`) returns `{ ctx, spy }`; `createRecordingContext()` gives a bare `{ ctx, spy }`.
- Every other test: `packages/react/test-setup.ts` attaches a recorder to each `HTMLCanvasElement` as `__spy` (typed `CanvasRecorder | undefined`). `mountChart` hands you `mainSpy` / `overlaySpy`.

```ts
interface RecordedCall {
  method: string;               // 'fillRect', 'lineTo', 'stroke', 'arc', 'beginPath', ...
  args: readonly unknown[];     // raw positional args
  fillStyle: string;            // style snapshot at call time
  strokeStyle: string;
  lineWidth: number;
  font: string;
  globalAlpha: number;
}

interface CanvasRecorder {
  readonly calls: readonly RecordedCall[];
  callsOf(method: string): RecordedCall[];          // all calls to one method
  countOf(method: string): number;                  // just the count
  reset(): void;                                    // clear between "before" and "after" in one test
  matchesSequence(methods: string[]): boolean;      // ordered subsequence, gaps OK
  fillStyleAt(x: number, y: number): string | null; // reverse-scan fillRects for a point
}
```

Typical queries:

```ts
// "renderer drew one body per candle"
expect(spy.countOf('fillRect')).toBeGreaterThanOrEqual(data.length);

// "line color matches theme"
const strokes = spy.callsOf('stroke');
expect(strokes.some((c) => c.strokeStyle === theme.line.color)).toBe(true);

// "a path was stroked"
expect(spy.matchesSequence(['beginPath', 'moveTo', 'lineTo', 'stroke'])).toBe(true);

// "bottom-left pixel is painted with the up candle color"
// `body` can be a tuple for a gradient, so flatten to a single color first.
expect(spy.fillStyleAt(10, 380)).toBe(resolveCandlestickBodyColor(theme.candlestick.up.body));
```

**Reset between phases:** for "before/after" assertions inside a single test, call `spy.reset()` right before the action. Not between separate tests — fresh canvases come with fresh spies.

---

## Template: renderer unit test

```ts
// packages/core/src/__tests__/renderers/<series>.test.ts
import { describe, expect, it } from 'vitest';

import { BarRenderer } from '../../series/bar';
import { buildRenderContext } from '../helpers/render-context';

describe('BarRenderer.render', () => {
  it('draws one fillRect per bar', () => {
    const renderer = new BarRenderer(1, { cornerRadius: 0 });
    renderer.setData([
      { time: 10, value: 3 },
      { time: 30, value: 5 },
    ]);
    const { ctx, spy } = buildRenderContext({ yRange: { min: 0, max: 10 } });

    renderer.render(ctx);

    expect(spy.countOf('fillRect')).toBe(2);
  });
});
```

**Rules:**
- No `mountChart`, no `ChartInstance`, no DOM. Pure renderer + context.
- `buildRenderContext` options set the time range, Y range, size, pixel ratio, theme and padding — check its `BuildContextOptions`.
- Assert on *primitives and their styles*, not on the resulting bitmap.

---

## Template: chart (core) test

```ts
// packages/core/src/__tests__/chart-<topic>.test.ts — the `chart-` prefix gives the file a DOM (see Gotchas)
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChartInstance } from '../chart';
import { installRaf, makeChartContainer } from './helpers/fake-raf';

describe('ChartInstance — <behavior>', () => {
  let raf: ReturnType<typeof installRaf>;
  let container: HTMLElement;
  let chart: ChartInstance;

  beforeEach(() => {
    raf = installRaf();
    container = makeChartContainer(); // 800×400 with a patched getBoundingClientRect
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
    raf.uninstall();
  });

  it('<user-visible behavior>', () => {
    chart = new ChartInstance(container, { interactive: false });
    const id = chart.addSeries('line');
    chart.setSeriesData(id, [{ time: 1_000_000, value: 1 }, { time: 1_060_000, value: 2 }]);
    raf.flush(60);

    const main = container.querySelector('canvas')?.__spy;

    expect(main?.countOf('stroke')).toBeGreaterThan(0);
  });
});
```

**Rules:**
- `raf.flush(frames)` runs queued frames, 16ms each. Flush enough frames for the animation under test to settle, or step one frame to read a tween mid-way.
- The first canvas in the container is the main layer, the last one the overlay.

---

## Template: interaction handler unit test

```ts
// @vitest-environment happy-dom
// packages/core/src/__tests__/<gesture>-handler.test.ts — the environment comment stays on the first line
import { describe, expect, it, vi } from 'vitest';

import type { PanZoomTarget } from '../interactions/pan-zoom-target';
import { ZoomHandler } from '../interactions/zoom';
import type { XScale } from '../scales/x-scale';

describe('ZoomHandler.handleWheel', () => {
  it('multiplies a DOM_DELTA_LINE delta by 8 before the sensitivity', () => {
    const zoomAt = vi.fn();
    const target = { pan: vi.fn(), zoomAt } as unknown as PanZoomTarget;
    const timeScale = { getMediaWidth: () => 800, xToTime: (x: number) => x * 100 } as unknown as XScale;
    const handler = new ZoomHandler(target, timeScale);

    // A WheelEvent-shaped object: the constructor of a real one ignores offsetX.
    const wheel = { deltaY: -1, deltaMode: 1, offsetX: 0, preventDefault: vi.fn() } as unknown as WheelEvent;
    handler.handleWheel(wheel);

    const [, factor] = zoomAt.mock.calls[0];
    expect(factor).toBeCloseTo(Math.exp(-8 * 0.005), 5);
  });
});
```

**Rules:**
- Mock only the surface the handler reads, typed through `as unknown as <Interface>` — never `any`.
- Build the event as a plain object of the fields the handler reads. A real `new WheelEvent(...)` in jsdom/happy-dom drops `offsetX`/`offsetY`, so it needs `Object.defineProperty(event, 'offsetX', { value })`.

---

## Template: React integration / regression test

```tsx
// packages/react/src/__tests__/integration/<regression>.test.tsx
import { LineSeries } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

describe('<regression name>', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  it('<user-visible behavior>', () => {
    mounted = mountChart(<LineSeries data={fixture} />, { width: 800, height: 400 });
    const before = mounted.chart.getVisibleRange();

    mounted.dispatchWheel({ deltaY: -200, clientX: 400 });
    mounted.flushScheduler();

    const after = mounted.chart.getVisibleRange();
    expect(after.to - after.from).toBeLessThan(before.to - before.from);
  });
});
```

**Rules:**
- Always `unmount()` in `afterEach`. Otherwise canvases accumulate across tests and spy counts leak.
- Call `flushScheduler()` after any action that schedules a frame (data swap, wheel, rerender). Without it the spy is empty.
- For data swaps, use `mounted.rerender(<NewChildren />)` — not `mounted.chart.setSeriesData` — because you want to exercise the React → core path.

---

## Template: React component test

```tsx
// packages/react/src/__tests__/components/<name>.test.tsx
import { fireEvent } from '@testing-library/react';
import { Legend, LineSeries } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

describe('<Component>', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  it('responds to user click', () => {
    mounted = mountChart(
      <>
        <LineSeries data={[[{ time: 1, value: 1 }]]} />
        <Legend />
      </>,
    );
    const item = mounted.container.querySelector('[data-legend] > div');
    if (!(item instanceof HTMLElement)) throw new Error('no legend item');

    fireEvent.click(item);
    mounted.flushScheduler();

    // assert on mounted.chart state, not DOM — legend re-renders only after React commit.
    const [id] = mounted.chart.getSeriesIds();
    expect(mounted.chart.isLayerVisible(id, 0)).toBe(false);
  });
});
```

**Rules:**
- Prefer RTL `fireEvent.click(el)` over `el.click()` — the former `act()`-wraps automatically.
- For CSS/style assertions, use `style.background` / `style.cursor` — computed style is unreliable in jsdom.
- Don't query ephemeral DOM with brittle CSS paths; prefer `data-*` markers already in production code (e.g. `[data-legend]`).

---

## Template: Vue wrapper test

```ts
import { mount } from '@vue/test-utils';
import { CandlestickSeries, ChartContainer, type OHLCInput, catppuccin } from '@wick-charts/vue';
import { defineComponent, h, ref } from 'vue';

import { installRaf, uninstallRaf } from '../../../react/src/__tests__/helpers/raf';

it('mounts and draws after a data update', async () => {
  installRaf();
  const host = document.createElement('div');
  document.body.appendChild(host);
  // ...patch getBoundingClientRect on host + descendants (see vue smoke.test.ts)...

  const data = ref<OHLCInput[]>([]);
  const App = defineComponent({
    setup: () => () => h(ChartContainer, { theme: catppuccin.theme }, () => [h(CandlestickSeries, { data: data.value })]),
  });
  const wrapper = mount(App, { attachTo: host });
  await settle(); // alternates nextTick() + flushAllRaf()
  data.value = fixture;
  await settle();

  const spy = host.querySelector('canvas')?.__spy;
  expect(spy?.countOf('fillRect')).toBeGreaterThan(0);

  wrapper.unmount();
  uninstallRaf();
});
```

## Template: Svelte wrapper test

Svelte tests render a small `*Harness.svelte` that puts the component under test in a `ChartContainer`.

```ts
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';

import SmokeHarness from './SmokeHarness.svelte';

it('mounts the Svelte wrapper', async () => {
  const result = render(SmokeHarness, { variant: 'candlestick', candlestickData });
  for (let i = 0; i < 6; i++) {
    await tick();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  }

  expect(result.container.querySelectorAll('canvas').length).toBeGreaterThanOrEqual(2);
  result.unmount();
});
```

**Svelte-specific rules:**
- Tests run under `jsdom` (not happy-dom) — see `vitest.config.ts`. Svelte 4's flush is sensitive to DOM quirks.
- Don't install the fake RAF — real `requestAnimationFrame` from jsdom is needed for Svelte's render callbacks.
- The harnesses are legacy-mode Svelte (`export let`, `$:`), matching the package source; `$:` reactive blocks fire on mount, so initial data lands.

---

## Regression class map

Each of these production regressions has a guard test. Grep for the commit hash to find the context.

| # | Symptom | Commit | Guard test |
|---|---|---|---|
| 1 | Layout jump on mount (late Legend registration) | `be01d6b` | `packages/react/src/__tests__/integration/mount-layout.test.tsx` |
| 2 | yScale stale after setSeriesData | `7ac1a6b` | `integration/data-update-sync.test.tsx` |
| 3 | Streaming gap on catch-up after tab throttle | `1c1aff1` | `integration/streaming-gap.test.tsx` |
| 4 | Mixed Date/number normalization | `2dbd2f4` | `integration/mixed-input-types.test.tsx` + `renderers/normalization.test.ts` |
| 5 | Y-range stacking (off/normal/percent) | — | `core/__tests__/bar-range.test.ts` + `line-range.test.ts` |
| 6 | Resize/DPI black flash | — | `integration/resize-dpi.test.tsx` |
| 7 | Visibility toggle in batch (hidden layers still in Y-range) | — | `integration/visibility-batch.test.tsx` |

When adding a regression-class test: copy the nearest file, adapt the fixture, and name the `describe` after the symptom.

---

## Gotchas

### Test environment by file name

- `vitest.config.ts` picks the DOM by path: core `chart-*.test.ts` and everything in `packages/react` / `packages/vue` get happy-dom, `packages/svelte` gets jsdom, the other core tests run in plain Node.
- A core test that makes a `ChartInstance` must be named `chart-*.test.ts`, or start with `// @vitest-environment happy-dom` (as the handler tests do). Otherwise `document` is undefined.

### RAF + scheduler

- Core tests: `installRaf()` from `packages/core/src/__tests__/helpers/fake-raf.ts` (frames advance only on `flush`).
- React tests: `mountChart` installs the React-side fake RAF (`packages/react/src/__tests__/helpers/raf.ts`); `flushScheduler()` drains it. Vue tests use the same helper directly.
- **Don't** install a fake RAF in Svelte tests — Svelte's scheduler needs the real jsdom `requestAnimationFrame`.

### ResizeObserver

- `packages/react/test-setup.ts` installs a `MockResizeObserver`; its live callbacks are on `globalThis.__mockResizeObserver.callbacks`.
- In React tests, `mounted.triggerResize(width, height)` patches the chart container's size and fires the observers.

### WheelEvent

- `new WheelEvent('wheel', { deltaY, deltaMode })` **does not** carry `offsetX/Y` in jsdom/happy-dom, and production zoom math reads `e.offsetX`.
- Handler tests: `Object.defineProperty(event, 'offsetX', { value: 400 })`.
- React integration tests: pass `clientX`/`clientY` to `mounted.dispatchWheel(...)`; the handler falls back to them.

### Cleanup between tests

- Always `mounted?.unmount()` (React) or `chart.destroy()` + `container.remove()` (core) in `afterEach`. Without it, live listeners and canvases leak into the next test.
- `mountChart` patches `HTMLDivElement.prototype.getBoundingClientRect` while the chart is mounted. If you bypass the helper, undo your own patch, or later tests read stale sizes.

### `mountChart` dimensions

- Default 800×400. Pass `{ width, height }` only when the behavior depends on size.

### React act() warnings

- An `act()` warning means an event was not wrapped. Use `fireEvent` from `@testing-library/react` for DOM events, and `mounted.dispatchMouse/Wheel/Touch` for chart canvas events — both handle `act` internally.
