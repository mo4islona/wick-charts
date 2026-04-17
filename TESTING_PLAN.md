# Testing Strategy — Wick Charts

> Этот файл живёт в корне репозитория как `TESTING_PLAN.md`, рядом с `REFACTOR_PLAN.md`.

## Context

Команда регулярно ломает фичи при имплементации других. Анализ git log показывает 7 повторяющихся классов регрессий:

1. **Layout jump on mount** — легенда регистрируется после первой отрисовки, сдвигает чарт (`be01d6b`).
2. **Rendering sync race** — `yScale` устаревает после `onDataChanged` до вызова `syncScales` (`7ac1a6b`).
3. **Streaming data gaps** — фоновый таб троттлит таймер, на catch-up пропускаются интервалы (`1c1aff1`).
4. **Mixed Date/number normalization** — старый код проверял только `[0]` элемент (`2dbd2f4`).
5. **Y-range stacking** — `off / normal / percent` пересчёт с mixed signs (покрыто частично).
6. **Resize / DPI black flash** — canvas теряет буфер при изменении размера.
7. **Visibility toggle в batch** — скрытые серии всё ещё в Y-range, grid не обновляется.

Сегодня в React-тестах canvas-контекст — Proxy-заглушка (`packages/react/test-setup.ts:32-45`), которая игнорирует все `fillRect / moveTo / arc`. **Покрытие canvas drawing в React-слое = 0%.** Большинство регрессий выше живут именно на стыке data → viewport → scales → render.

**Цель**: регрессионная сетка, которая ловит все 7 классов + базовые контракты отрисовки каждого рендерера, без тяжёлой инфры (pixel snapshots / native canvas).

## Approach

Ядро стратегии — **recording 2D context**: Proxy, запоминающий каждый вызов canvas API с снимком стилей. Это flips 0% canvas-coverage в полноценную валидацию "что/где/в каком порядке рисуем" без реального растеризатора.

Тесты раскладываются на 5 слоёв, каждый со своим target:

| Слой | Что ловит | Инструменты |
|---|---|---|
| **Renderer units** | Контракт отрисовки каждого series type | vitest node + recording ctx |
| **Math / viewport / scales** | Анкоринг, клампинг, stacking | vitest node (уже есть 11 файлов) |
| **Interaction handlers** | Wheel normalization, pan math, touch pinch | vitest node + mock viewport |
| **React integration** | Layout sync, streaming, resize, batch, theme | vitest jsdom + recording ctx + RTL |
| **Wrapper smoke** | Mount/unmount/prop change в Vue/Svelte | vitest |

Playwright/pixel snapshots — **отложено** до post-1.0. Recording ctx покрывает 90% регрессий, pixel snapshots закрывают только gradient/anti-aliasing drift, которых в git log не было.

## Infrastructure (Phase 0 — prerequisites)

Без этого остальные фазы не запускаются. Делаем первым.

### Файлы

| Файл | Назначение |
|---|---|
| `packages/core/src/__tests__/helpers/recording-context.ts` | Фабрика `createRecordingContext()` → `{ ctx, spy }`. Proxy пишет `{method, args, fillStyle, strokeStyle, lineWidth, font, globalAlpha}` на каждый вызов. Setters обновляют state-mirror. |
| `packages/core/src/__tests__/helpers/fake-canvas.ts` | Фабрика `createFakeCanvas(w, h)` → `HTMLCanvasElement`-подобный объект с `getContext` возвращающим recording ctx. Для рендереров в node-окружении. |
| `packages/react/test-setup.ts` | **Заменить** Proxy-заглушку на recording ctx. Прикрепить `canvas.__spy: CanvasRecorder` к каждому созданному canvas. |
| `packages/react/src/__tests__/helpers/mount-chart.tsx` | `mountChart(children, opts?)` → `{ container, chart, mainSpy, overlaySpy, rerender, unmount, flushScheduler, triggerResize, dispatchWheel, dispatchMouse, dispatchTouch }`. |
| `packages/react/src/__tests__/helpers/raf.ts` | `installRaf()` / `flushRaf()` для ручной прокрутки `requestAnimationFrame` (scheduler использует rAF). Интегрируется с `vi.useFakeTimers()`. |

### API спая

```ts
interface CanvasRecorder {
  readonly calls: readonly RecordedCall[];
  callsOf(method: string): RecordedCall[];
  countOf(method: string): number;
  reset(): void;
  matchesSequence(methods: string[]): boolean;   // упорядоченное ≠ подряд
  fillStyleAt(x: number, y: number): string | null; // грубый lookup по bbox последнего fill
}

interface RecordedCall {
  method: string;
  args: readonly unknown[];
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  globalAlpha: number;
}
```

### Тесты самой инфры

- `helpers/recording-context.test.ts` — 4 теста: `fillRect → recorded`, `fillStyle set → captured on next call`, `reset() clears`, `matchesSequence handles gaps`.

---

## Phase 1 — Renderer unit tests

**Цель**: контракт каждого series type в изоляции. Каждый рендерер получает viewport + data → проверяем что `render(ctx)` вызывает правильные примитивы.

**Расположение**: `packages/core/src/__tests__/renderers/*.test.ts`

### `renderers/candlestick.test.ts`

- draws body rect per candle (N candles → N fillRect)
- up candle uses theme.candleUp color
- down candle uses theme.candleDown color
- wick drawn as line from high to low Y
- zero-volume candles still draw body
- volume overlay drawn when `showVolume: true`
- empty data → zero draw calls
- OHLC with mixed Date/number timestamps normalizes (regression #4)
- viewport slicing: only candles within `visibleRange` drawn

### `renderers/line.test.ts`

- single layer: `beginPath → moveTo → N lineTo → stroke`
- stroke color = layer color
- multi-layer off: each layer independent `beginPath`, colors distinct
- multi-layer normal stacking: Y-coords cumulative, `getValueRange` returns stacked total
- multi-layer percent stacking: Y values sum to 100
- area fill: `fill()` called when `fillArea: true`, gradient applied
- pulse animation: `needsAnimation = true` для live series
- decimation: `> N` points → reduces lineTo count
- empty store → zero draw calls
- hidden layer (`setLayerVisible(i, false)`) → skipped

### `renderers/bar.test.ts`

- single layer: N bars → N fillRect
- bar width respects `barWidthRatio`
- multi-layer off: bars grouped side-by-side
- multi-layer normal: bars stacked vertically
- negative values draw downward bars
- zero value → zero-height bar (или skip, в зависимости от имплементации)
- hidden layer skipped

### `renderers/pie.test.ts`

- N slices → N `arc()` calls with correct angles
- slice angle proportional to value
- `innerRadiusRatio > 0` → donut (arc + reverse arc)
- hover slice drawn with highlight color / larger radius
- `hitTest(x, y, w, h)` returns correct slice index for point inside arc
- `hitTest` returns -1 outside pie
- `getSliceInfo(theme)` returns percentages summing to 100
- `getHoverInfo(theme)` returns hovered slice data
- empty data → zero arc calls

### Infrastructure regressions (edge cases)

- `renderers/normalization.test.ts` — `normalizeOHLCArray` / `normalizeTimePointArray`: Date at [0], [1], [n], undefined, pre-normalized number — все корректно (regression #4).

---

## Phase 2 — Interaction + viewport + scales

**Цель**: математика зума/пана/scales в изоляции. Это slowest-to-reproduce регрессии в проде.

**Расположение**: `packages/core/src/__tests__/` (flat, как существующие)

### `viewport-zoom.test.ts`

- `zoomAt(time, factor<1)` — увеличивает, cursor time остаётся в диапазоне с той же пропорцией
- `zoomAt(time, factor>1)` — уменьшает
- `zoomAt` при clamps enabled — не выходит за `minTime/maxTime`
- `zoomAt` с factor=1 — no-op (no change event)
- `zoomAt` после pan — анкор корректный относительно нового origin
- `setRange(from, to)` — emits `change` event один раз
- `setRange` с инвертированным диапазоном — либо normalizes, либо rejects (уточнить)

### `viewport-pan.test.ts`

- `pan(dx)` в пикселях — сдвигает range пропорционально timePerPixel
- `pan(0)` — no-op, no event
- pan в конец данных — clamps
- pan + zoom — order-independent (математически коммутируют в разумных пределах)

### `zoom-handler.test.ts`

- `handleWheel` с DOM_DELTA_PIXEL — delta = deltaY
- `handleWheel` с DOM_DELTA_LINE — delta = deltaY * 8
- `handleWheel` с DOM_DELTA_PAGE — delta = deltaY * 24
- cursor X > chartWidth — клампится к chartWidth (исключаем Y-axis)
- sensitivity: delta * 0.005 → exp() → factor (проверить формулу)
- `preventDefault()` вызывается (не даём странице скроллиться)

### `pan-handler.test.ts`

- `handleMouseDown` — `isDragging() → true`
- `handleMouseMove` во время drag — вызывает `viewport.pan(dx)`
- `handleMouseMove` без drag — no-op
- `handleMouseUp` — `isDragging() → false`
- cancel drag (mouseleave) — ресетит state

### `touch-handler.test.ts` (внутри `handler.test.ts` или отдельно)

- single touch → pan (одна точка моделируется как mousedown+move)
- two touches → pinch zoom (distance delta → factor)
- two touches shift (без изменения distance) → pan of center
- touch end после pinch → не зависает в dragging

### `scales-sync.test.ts`

- `yScale` после `updateYRange` отражает новые данные
- `timeScale` после `setRange` обновляет mapping
- `syncScales()` → `yScale.getDomain()` матчит viewport yRange
- смена data во время batch → один sync на flush (regression #2)

---

## Phase 3 — React integration (regression-class tests)

**Цель**: закрепить 7 классов регрессий из git log. Один файл на класс.

**Расположение**: `packages/react/src/__tests__/integration/*.test.tsx`

### `integration/mount-layout.test.tsx` (regression #1, commit `be01d6b`)

- рендерит `<ChartContainer><CandlestickSeries/><Legend/></ChartContainer>`
- capture bounding box chart container до rAF flush
- flush rAF
- assert bbox тот же (no reflow от late legend registration)
- assert legend виден в DOM на первой отрисовке

### `integration/data-update-sync.test.tsx` (regression #2, commit `7ac1a6b`)

- mount с initial data (диапазон 0-100)
- `chart.setSeriesData('id', newDataWithRange(0, 1000))`
- flush scheduler
- последние `fillRect` Y-координаты должны помещаться в новый scale (0-1000), не в старый (0-100)
- subscribe на `yScale` события — assert update пришёл до render

### `integration/streaming-gap.test.tsx` (regression #3, commit `1c1aff1`)

- mount с series и data до `t=1000`
- симулируем stale tick: `appendData` с `t=5000` (пропуск 4 интервалов)
- flush
- assert линия идёт до `t=5000` без visible gap (последняя `lineTo` x-координата у правого края visible range, не в середине)
- variant: rapid append (10 точек в batch) — один render

### `integration/mixed-input-types.test.tsx` (regression #4, commit `2dbd2f4`)

- `<LineSeries data={[{ time: new Date(...), value }, { time: 1700..., value }, ...]}/>` — mixed Date и number
- flush
- draw calls показывают правильную сортировку по времени
- variant: Date только в [0], Date только в [n]
- variant: invalid input (string timestamp) — либо throws, либо ignored, но не silent wrong render

### `integration/resize-dpi.test.tsx` (regression #6)

- mount → первый render
- trigger `MockResizeObserver.callbacks` с новым размером `{width: 800, height: 400}`
- flush
- assert main spy: `clearRect` → `fillRect...` (sequence, не параллельно)
- assert canvas.width/height обновлены с учётом `devicePixelRatio`
- variant: DPR change (`window.devicePixelRatio = 2`) → redraw, pixel dimensions x2

### `integration/visibility-batch.test.tsx` (regression #7)

- mount с 3 layers visible
- `chart.batch(() => { chart.setSeriesVisible('a', false); chart.setSeriesVisible('b', false); chart.setSeriesVisible('c', false); })`
- flush
- **main spy.countOf('clearRect') === 1** (один render, не три)
- Y-range пересчитан без скрытых слоёв
- grid обновлён

### Дополнительно (не строго регрессия, но интеграционное покрытие):

### `integration/zoom-render.test.tsx`

- mount, reset spy
- `dispatchWheel(canvas, { deltaY: -100, clientX: 400 })` (zoom in)
- flush
- `chart.getVisibleRange()` уже и чем initial
- ровно один redraw
- первая `fillRect` X-координата после zoom ≠ старой

### `integration/pan-render.test.tsx`

- mousedown → mousemove(-200px) → mouseup
- visible range сдвинулся влево
- redraw прошёл
- crosshair события эмитятся во время drag

### `integration/theme-switch.test.tsx`

- mount с `theme: dracula`
- assert candle up colors match dracula palette
- `chart.setTheme(catppuccin)`
- flush
- assert candle up colors match catppuccin
- все 4 series types (candlestick/line/bar/pie) реагируют на смену темы

### `integration/unmount-cleanup.test.tsx`

- mount
- capture `MockResizeObserver.callbacks.size`
- unmount
- assert нет утечки listeners на TimeSeriesStore
- assert ChartInstance.destroy вызван
- повторный mount/unmount цикл → callbacks.size стабилен

### `integration/crosshair-tooltip.test.tsx`

- mount с Tooltip
- dispatch mousemove на середину canvas
- assert overlay spy: crosshair line нарисована на mouseX
- tooltip DOM содержит значения ближайшей точки
- mouseleave → crosshair очищен, tooltip скрыт

---

## Phase 4 — React component integration

**Цель**: каждый React-компонент из публичного API имеет хотя бы один integration test. Эти тесты короче Phase 3, фокус на контракте компонента.

**Расположение**: `packages/react/src/__tests__/components/*.test.tsx`

### `components/sparkline.test.tsx`

- `<Sparkline data={points}/>` → line drawn edge-to-edge
- no axes rendered (no text calls)
- color prop respected

### `components/legend.test.tsx`

- legend item per series
- item color matches series color
- click toggles `isLayerVisible`
- multi-layer series — item per layer

### `components/pie-legend.test.tsx`

- item per slice с correct percentage text
- hover slice → corresponding item highlighted

### `components/pie-tooltip.test.tsx`

- mousemove над slice → tooltip с slice data
- mousemove вне pie → tooltip скрыт

### `components/tooltip-legend.test.tsx` (уже есть, расширить)

- существующие 2 теста
- + new: tooltip-legend + crosshair sync
- + new: multi-series tooltip-legend shows all series

### `components/y-axis.test.tsx`

- tick count ≈ expected (± 1)
- format prop применяется
- right/left side positioning

### `components/time-axis.test.tsx`

- tick count ≈ expected
- format выбирается по интервалу (ms → sec → min → hour → day)
- DST transition не ломает форматирование

### `components/chart-container-props.test.tsx`

- `interactive: false` → нет wheel/mousedown listeners
- `grid: false` → grid primitives не рисуются
- `padding: {top, bottom}` → расчёт area учитывает padding
- `axis: { y: { visible: false } }` → нет Y-axis DOM

### `components/sift-children.test.tsx` (уже есть)

- existing 1 test, не меняем

---

## Phase 5 — Wrapper smoke tests

**Цель**: ловить breakage Vue/Svelte обёрток при core-refactor. Минимум 1 файл на обёртку.

**Расположение**: `packages/{vue,svelte}/src/__tests__/`

### `packages/vue/src/__tests__/smoke.test.ts`

Используем `@vue/test-utils` (добавить в devDeps).

- mount `ChartContainer` с `CandlestickSeries` — canvas в DOM, spy.calls > 0
- mount `LineSeries` single-layer
- mount `BarSeries` multi-layer
- mount `PieSeries`
- reactivity: `ref(data).value = newData` → re-render, spy.reset + spy.calls > 0
- unmount → canvas DOM удалён, ChartInstance.destroy вызван
- composables accessible: `useChartInstance`, `useCrosshairPosition`, `useVisibleRange`

### `packages/svelte/src/__tests__/smoke.test.ts`

Используем `@testing-library/svelte` (добавить в devDeps).

- Same 4 series types mount/unmount
- Store reactivity: `data.set(newData)` → re-render
- Context hooks work: `getChartContext()`, `createCrosshairPosition()`

### vitest config update

Вероятно потребуется добавить `environmentMatchGlobs` для Vue/Svelte:
- `packages/vue/**/*.test.ts` → jsdom
- `packages/svelte/**/*.test.ts` → jsdom

И расширить `include` в `vitest.config.ts`:
```ts
include: [
  'packages/core/src/**/*.test.ts',
  'packages/react/src/**/*.test.{ts,tsx}',
  'packages/vue/src/**/*.test.ts',
  'packages/svelte/src/**/*.test.ts',
],
```

---

## Phase 6 (DEFERRED) — Visual regression

Решено отложить до post-1.0 или до хостинга демо-страницы. Причины:
- Infrastructure weight: Playwright runners, snapshot storage, OS-specific font drift
- Текущие регрессии (#1-#7) не про pixels — про порядок/координаты, Recording ctx покрывает
- Unique Playwright value (gradients, anti-aliasing) — не ваш pain сегодня

**Если позже внедряем**: 3-5 канонических видов из `docs/pages/DashboardPage.tsx`, Linux-only в CI, advisory (не блокирующий).

---

## Phase 7 — Testing skill

**Цель**: Claude/Cursor sessions пишут тесты единообразно, не изобретая каждый раз spy-API или паттерн `mountChart + flushScheduler + assert`.

**Расположение**: `.agents/skills/wick-charts-testing/SKILL.md` (+ `context.md` с примерами).

### Почему отдельный скилл, а не расширение `wick-charts`

| Скилл | Когда срабатывает |
|---|---|
| `wick-charts` (существует) | Юзер строит чарт: `создай candlestick chart с...` |
| `wick-charts-testing` (новый) | Юзер пишет тест: открыт `*.test.ts(x)` в репе; просьба `покрыть тестом...`; упоминание 7 классов регрессий |

Смешивать триггеры → скилл загружается даже когда не нужен → drift в поведении.

### Что внутри скилла

#### `SKILL.md` (frontmatter + основные правила)

- **Frontmatter**: description триггерит на "test", "vitest", "*.test.ts", "recording", "spy", "cover", "regression" + detection что cwd содержит `packages/core/src/chart.ts`
- **Decision matrix**: таблица "регрессия X → слой Y → файл Z" (Phase 1-5 из этого плана)
- **Non-goals**: что НЕ тестируем (pixels, animation frames, perf)
- **Вызов `context.md`** для конкретных примеров

#### `context.md` (шаблоны и рецепты)

1. **Recording context cheatsheet** — полный API `CanvasRecorder`, примеры queries (`callsOf`, `countOf`, `matchesSequence`, `fillStyleAt`).
2. **Шаблон "renderer unit test"** — boilerplate для `renderers/*.test.ts` с `createFakeCanvas` + `renderer.render(ctx)` + assert.
3. **Шаблон "integration regression test"** — `mountChart` + user action + `flushScheduler` + assert on spy + assert on DOM.
4. **Шаблон "interaction handler unit test"** — mock viewport + fake event + assert calls.
5. **Шаблон "wrapper smoke test"** — mount-change-unmount для Vue/Svelte.
6. **Common gotchas**:
   - `requestAnimationFrame` в jsdom → `vi.useFakeTimers()` + `flushRaf()`
   - `ResizeObserver` callback trigger через `MockResizeObserver.callbacks`
   - `WheelEvent` с кастомным `deltaMode` требует явного создания через `new WheelEvent('wheel', {...})`
   - Cleanup между тестами: `afterEach(() => cleanup())` из RTL, `spy.reset()` вручную
7. **Mapping 7 regressions → test file** (copy-paste ready selection criteria).

### Файлы

| Файл | Что внутри |
|---|---|
| `.agents/skills/wick-charts-testing/SKILL.md` | Trigger rules + decision matrix + pointer to context |
| `.agents/skills/wick-charts-testing/context.md` | API cheatsheet + 5 шаблонов + gotchas |

### Effort

~0.5 day после того как Phase 0 (recording ctx API) готов — шаблоны пишутся с боевого кода реальных тестов Phase 1-3.

### Verification

- Открыть чистую Claude-сессию в репе, попросить "покрой тестом zoom handler" — проверить что session выбирает правильный слой (Phase 2 — interaction unit), использует spy API корректно, не придумывает несуществующие хелперы.
- Проверить что скилл НЕ триггерится на задачу "построй pie chart" (это для `wick-charts`).

### Когда писать

**После Phase 3** (когда есть ≥3 integration теста как reference) **и до Phase 4** (чтобы Phase 4 писалась уже со скиллом, проверив его работу).

---

## Non-goals

1. **Pixel-exact rendering** — recording ctx asserts intent, не output. Clipping bugs проходят мимо.
2. **Cross-browser canvas quirks** — jsdom only. Safari/Firefox differences = Playwright concern.
3. **Performance budgets** — no frame-time / draw-call-count budgets. Premature для 0.2.x.
4. **Animation frame validation** — `RenderScheduler` timing фуззи в jsdom. Тестируем state после flush, не кадры в процессе.
5. **Full Vue/Svelte parity** — обёртки тонкие, per-feature тесты = дубль React coverage.
6. **DashboardPage / docs coverage** — manual smoke, не test target.

---

## File layout summary

### New files

```
packages/core/src/__tests__/
  helpers/
    recording-context.ts               # Phase 0
    recording-context.test.ts          # Phase 0 self-test
    fake-canvas.ts                     # Phase 0
  renderers/
    candlestick.test.ts                # Phase 1
    line.test.ts                       # Phase 1
    bar.test.ts                        # Phase 1
    pie.test.ts                        # Phase 1
    normalization.test.ts              # Phase 1
  viewport-zoom.test.ts                # Phase 2
  viewport-pan.test.ts                 # Phase 2
  zoom-handler.test.ts                 # Phase 2
  pan-handler.test.ts                  # Phase 2
  touch-handler.test.ts                # Phase 2
  scales-sync.test.ts                  # Phase 2

packages/react/src/__tests__/
  helpers/
    mount-chart.tsx                    # Phase 0
    raf.ts                             # Phase 0
  integration/
    mount-layout.test.tsx              # Phase 3
    data-update-sync.test.tsx          # Phase 3
    streaming-gap.test.tsx             # Phase 3
    mixed-input-types.test.tsx         # Phase 3
    resize-dpi.test.tsx                # Phase 3
    visibility-batch.test.tsx          # Phase 3
    zoom-render.test.tsx               # Phase 3
    pan-render.test.tsx                # Phase 3
    theme-switch.test.tsx              # Phase 3
    unmount-cleanup.test.tsx           # Phase 3
    crosshair-tooltip.test.tsx         # Phase 3
  components/
    sparkline.test.tsx                 # Phase 4
    legend.test.tsx                    # Phase 4
    pie-legend.test.tsx                # Phase 4
    pie-tooltip.test.tsx               # Phase 4
    y-axis.test.tsx                    # Phase 4
    time-axis.test.tsx                 # Phase 4
    chart-container-props.test.tsx     # Phase 4

packages/vue/src/__tests__/
  smoke.test.ts                        # Phase 5

packages/svelte/src/__tests__/
  smoke.test.ts                        # Phase 5
```

### Modified files

| Файл | Изменение |
|---|---|
| `packages/react/test-setup.ts` | Replace Proxy stub with recording ctx; attach `canvas.__spy` |
| `vitest.config.ts` | Extend `include` + `environmentMatchGlobs` для vue/svelte |
| `packages/vue/package.json` | Add devDep: `@vue/test-utils` |
| `packages/svelte/package.json` | Add devDep: `@testing-library/svelte` |
| `packages/core/src/__tests__/line-range.test.ts` | После REFACTOR_PLAN: `r.stores[i].setData` → `r.setData(data, i)` |
| `packages/core/src/__tests__/bar-range.test.ts` | Same as above |

### Test counts by phase

| Phase | Files | ~Tests |
|---|---|---|
| 0 Infrastructure | 4 helpers + 1 self-test | 4 |
| 1 Renderers | 5 | ~35 |
| 2 Interaction/viewport | 6 | ~25 |
| 3 React integration | 11 | ~30 |
| 4 React components | 7 | ~20 |
| 5 Wrappers smoke | 2 | ~12 |
| 7 Testing skill | 2 skill files | — |
| **Total** | **38** | **~126** |

---

## Execution order (recommended)

1. **Phase 0** (0.5 day) — recording ctx + helpers. Gating для 1-5.
2. **Phase 1** (1 day) — рендереры. Выявит скрытые баги в existing renderers; fast ROI.
3. **Phase 3 regression subset** (1.5 day) — только 7 файлов закрывающих git-log регрессии (mount-layout, data-update-sync, streaming-gap, mixed-input-types, resize-dpi, visibility-batch, unmount-cleanup). Быстрый safety net.
4. **Phase 7** (0.5 day) — testing skill. Пишем после Phase 3, чтобы шаблоны в context.md были списаны с реальных тестов, а не теоретические.
5. **Phase 2** (1 day) — interaction math.
6. **Phase 3 remainder** (0.5 day) — zoom-render, pan-render, theme-switch, crosshair-tooltip.
7. **Phase 4** (1 day) — components. Пишется с использованием скилла из Phase 7.
8. **Phase 5** (0.5 day) — wrappers smoke.

**Total: ~6.5 дней работы.** После каждой фазы — запускаем полный `pnpm test`, коммитим.

## Verification

После каждой фазы:
1. `pnpm test` — все новые + старые зелёные
2. `pnpm typecheck` — нет ошибок типов
3. `pnpm build` во всех пакетах — не сломали API
4. `pnpm --filter test-react dev` — запустить example app, визуально проверить 4 chart types (smoke)

После Phase 3 прогнать **regression replay**: для каждого из 7 commits (`be01d6b`, `7ac1a6b`, `1c1aff1`, `2dbd2f4`, ...) — временно git-revert fix, убедиться что соответствующий тест красный, git-restore.

После всех фаз: проверить что `packages/react/test-setup.ts` не содержит no-op Proxy, а расход времени на CI не вырос > 2x.

---

## Open questions

(если есть — можно задать перед стартом)

- Приоритет Phase 2 vs Phase 4: если команда упирается в багу зума — выносим Phase 2 в параллель с Phase 1.
- `@vue/test-utils` vs просто `createApp + mount` — зависит от того, есть ли пилотный Vue-разработчик.
- Нужно ли pin node version для CI (node 20+), чтобы Proxy/`structuredClone` работали одинаково.
