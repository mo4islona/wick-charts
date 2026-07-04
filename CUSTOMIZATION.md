# Аудит API wick-charts: расширяемость и понятность

## Context

Цель продукта — самые кастомизируемые чарты: максимально прозрачный и расширяемый движок при самом понятном API. Проведён полный аудит публичной поверхности (core `index.ts` + `ChartInstance` + `ChartOptions` + все series options; React-обёртка целиком; Vue/Svelte-паритет; доки). Ниже — что уже хорошо, что не хватает, и приоритизированный план работ.

**Ревью 2026-07-04**: все утверждения перепроверены против кода — правки внесены по месту. Интро-контракты живут на ветке `feat/intro-animations`; текущая ветка `feat/heatmap` добавила пятый вид серии, что местами меняет картину (отмечено ниже). Добавлен раздел «Дополнительные DX-находки».

## Что уже хорошо (не трогать)

- **Порог входа**: 1 установка + ~10 строк до первого чарта; всего 3 концепта (container → series → overlays). Реальный API reference (19 компонент + 7 хуков), пропсы генерятся из исходников.
- **Painters / intro-анимации как чистые функции без реестра** (`LinePainter`, `BarIntroFn`, …) — образцовая прозрачность, tree-shaking работает. Это уже большая plugin-поверхность (4 Fn-контракта + ~11 фабрик на `feat/intro-animations`), что смягчает тезис «движок закрыт», — но renderer/scale/canvas-интерфейсы всё ещё приватны (п.1 ниже в силе).
- **Всеядные data-шейпы** (`MultiLayerData`), `ValueColor` (цвет-функция), `SeriesLayer` с label/color рядом с данными.
- Render-props почти на всех оверлеях; parity-checker пропсов между React/Vue/Svelte.

## Ключевые дыры расширяемости (движок «прозрачен» не до конца)

### P0 — блокирует обещание «самый расширяемый»

1. **Кастомный тип серии невозможен на уровне типов.**
   `SeriesDefinition` экспортирован, но его возвращаемый контракт — нет: `SeriesRenderer`, `TimeSeriesRenderer`, `SeriesRenderContext`, `XScale`, `YScale`, `BitmapCoordinateSpace` отсутствуют в `packages/core/src/index.ts`. Плюс `SeriesKind`/`SeriesType` — закрытый union, теперь из пяти членов (`'candlestick'|'line'|'bar'|'pie'|'heatmap'`, `series/types.ts:79`, `types.ts:160`) — добавление heatmap как раз потребовало править union и ветвления руками, что подтверждает проблему. Появился и второй закрытый под-union `SpatialSeriesKind = 'pie' | 'heatmap'` (`series/types.ts:82`).
   → Экспортировать контракт целиком; открыть kind (`SeriesType | (string & {})` + generic-dispatch вместо ветвления `kind !== 'pie'` в `chart.ts:1288, 1332, 1352, 1793, 1904`).

2. **Нет ни одного события клика/ховера по данным.**
   `InteractionHandler` объявляет `click` (`interactions/handler.ts:12`), но он **нигде не эмитится** — единственные `emit` в файле это `crosshairMove` (handler.ts:83, 138, 160, 166); `dblclick` — осознанная заглушка («Handled externally via chart.fitContent()»). Полный список событий `ChartInstance` (`chart.ts:68-89`): `crosshairMove, viewportChange, dataUpdate, seriesChange, overlayChange, tickFrame` — всё.
   Важное уточнение: hover-диспетчеризация уже generic — capability-check `renderer.hitTest + setHoverIndex` (`chart.ts:431, 1671, 1676`), реализаторов уже два (pie `series/pie.ts:463`, heatmap `series/heatmap.ts:307`). «Дожать» клики дешевле, чем кажется: механизм есть, не хватает эмита и публичного события.
   → Доэмитить `click`/`dblclick` + пробросить hit-результат до `chart.on('pointClick', …)` и декларативных `onPointClick`/`onSeriesHover` в обёртках; для time-series серий реализовать `hitTest`.

3. **Формат оси времени захардкожен.** `formatTime` — `'en-US'`, `hour12:false`, локальная TZ (`utils/time.ts:39-56`); фикс. тир-таблицы — `niceTimeIntervals` (`utils/time.ts:65-88`). У `YScale` есть `setFormat` (`y-scale.ts:106`), у time-scale — нет. Нет locale, нет UTC, нет кастомных тиков (Y тоже заперт на {1,2,5}×10^k, `y-scale.ts:6-27, 189`).
   → `timeScale.setFormat` / `ticks`-хук на обеих шкалах + `locale`/`timeZone` в `ChartOptions`.

### P1 — расширяемость

4. **Нет санкционированного кастомного рисования на canvas** — `CanvasManager` (2 слоя) приватен, z-order фиксирован; единственный путь — написать целую серию. → публичный `chart.addLayer(draw, {z})`-хук.
5. **Жесты не настраиваются**: `interactive` — всё-или-ничего (`chart/options.ts:83`, `chart.ts:397-398`); чувствительность колеса `0.005` захардкожена (`interactions/zoom.ts:16`); Y-pan/zoom отсутствует как класс. → `interactions: { pan, zoom, wheel, … }`.
6. **Crosshair**: только цвета из темы (`theme/types.ts:111-116`); нет magnet/snap-to-candle, нет vertical-only, dash `[4,4]` захардкожен (`components/crosshair.ts:18`).
7. **Шкалы не инжектируются**: только linear, нет log/percent; один Y, одна панель (нет volume-pane / второй оси). Большая работа — зафиксировать как направление после viewport-рефакторинга.

## Ключевые проблемы понятности (DX)

### P0 — ломает доверие к API

1. **`animations` init-only по identity — новый объект пересоздаёт весь чарт** (`ChartContainer.tsx:283-322`, признано в TODO). Самая опасная ловушка API. Уточнение: поведение одинаково во всех трёх обёртках (`ChartContainer.vue:250-267`, `ChartContainer.svelte:206-238`), но признающий `TODO(api)` есть только в React — фикс должен покрыть все три.
2. **Ручные dep-списки опций в series-компонентах**: опция вне списка молча не обновляется. Актуальные примеры: `pulseMs` у Line (`types.ts:301` — live-опция, отсутствует в dep-списке `LineSeries.tsx`, там только `pulse`) и `anchor` у Bar (но он `@internal` — низкий импакт). Обработка массивов в deps непоследовательна: Candlestick схлопывает tuple-body в строку через `join`, а Heatmap диффит `colors`/`columns`/`rows` по identity — inline-литерал переприменяет опции каждый рендер. Плюс устаревший комментарий в `CandlestickSeries.tsx:63` ссылается на несуществующую обработку `colors` у Bar/Line.
   ~~`colors` у Line/Bar выпали~~ — неверно: опции `colors` у Line/Bar не существует, цвет слоя идёт через `SeriesLayer.color` и применяется data-эффектом (`syncLayers`). Пропагация intro-опций уже починена на `feat/intro-animations` (`dbdca11`, латч-обёртка).
   → generic-diff `options` вместо ручных списков — рекомендация в силе, ручной список гарантированно отстаёт от каждой новой опции.
3. **Дрейф экспортов Vue/Svelte**: на `feat/intro-animations` intro-фабрики (`sweepIntro`…), `spring/snap/hermite`, типы `AnimationsConfig`, `EdgeReachedInfo` неимпортируемы из Vue/Svelte, хотя доки их учат, а пропсы их используют. `EdgeLoader` невидим для parity-checker (его нет в `api-manifest.json`, а checker сравнивает только пропсы компонентов из манифеста — не exports). `VisibleRangeSpec`/`MultiLayerData` экспортирует core (`core/src/index.ts`), но **ни одна из трёх framework-обёрток** — при этом это типы публичных пропсов (`data`, `viewport.initialRange`). → синхронизировать индексы + расширить checker на module-level exports.

### P1 — консистентность и полнота

4. **Именование форматтеров**: `format` vs `formatValue` (Sparkline); три типа форматтера (`TooltipFormatter`, `ValueFormatter`, плюс инлайновый анонимный у Sparkline, структурно = `ValueFormatter`); формат времени в шапке Tooltip не настраивается без полного render-prop.
5. **Mount-only vs live пропсы не декларированы**: `padding` — расхождение **обратное** написанному ранее: JSDoc говорит «Applied on mount only» (`ChartContainer.tsx:45-46`), а код live-обновляет через `setPadding` (`ChartContainer.tsx:353-370`, core `chart.ts:1587`) — чинить надо JSDoc, не поведение. `interactive` молча mount-only (нет `setInteractive` в core) рядом с live `grid` (`setGrid`, `ChartContainer.tsx:372-376`). → таблица реактивности в JSDoc каждого пропса + единообразие.
6. **Нет декларативных колбэков**: `onVisibleRangeChange`, `onCrosshairMove`, `onReady`, `onLegendToggle` — только императивный `chart.on()` (единственное исключение — `onEdgeReached`, и тот mount-only через ref). Нет controlled `visibleRange`, нет `visible` на series-компоненте.
7. **Мелочи**: `Sparkline` требует `theme` обязательным; `useThemeOptional` не экспортирован; `XAxis`-алиас только в React (а доки называют страницу «XAxis»); у Tooltip render-prop оставляет «стеклянный» контейнер, у PieTooltip — голый div.
8. **Accessibility = 0**: нет aria/keyboard нигде (легенда — div с onClick, без role/tabIndex/onKeyDown, `Legend.tsx:252-273`).

## Дополнительные DX-находки (ревью 2026-07-04)

### High

1. **Съехавшие `@deprecated` в barrel-экспортах всех трёх обёрток.** `react/src/index.ts:19` вешает «Use StackingMode instead» на `BuildHoverSnapshotsArgs`, `:41` — «Use TimePoint instead» на `LineSeriesOptions`; то же в `vue/src/index.ts:17,36` и `svelte/src/index.ts:17,36`, и на `main` тоже. Происхождение: в `6e76ab5` комментарии корректно висели на deprecated-алиасах `BarStacking`/`LineData`, в `5bb19c4` алиасы удалили, а JSDoc-строки забыли — осиротевшие комментарии прилипли к следующим по алфавиту экспортам. IDE зачёркивает ходовой `LineSeriesOptions` с бессмысленной подсказкой. Фикс — удалить 6 строк.
2. **Нет `'use client'`** нигде в `packages/react/src` — импорт `@wick-charts/react` в Next.js App Router (RSC) падает; требование нигде не задокументировано. Фикс — banner в сборке или страница в доках.
3. **Чарт молча схлопывается в 0 высоты**: обёртка `height:'100%'` без min-height/aspect-ratio (`ChartContainer.tsx:522-533`), canvas читает `getBoundingClientRect` (`canvas-manager.ts:78`), а README Quick Start (`README.md:43`) рендерит `<ChartContainer>` без размера у родителя — copy-paste даёт невидимый чарт и никакого warn.
4. **JSDoc пропа `perf` описывает удалённый API**: документированы `perf: true` и `perf={{ hud: true, … }}` (`ChartContainer.tsx:127-129`), реальный тип — `PerfMonitor | PerfConfig` (`chart/options.ts:121`), core бросает на не-factory форму (`options.ts:148`); рабочая форма — `perf={perfHud(...)}`.

### Medium

5. **Замена данных той же длины обновляет только последнюю точку**: `data/sync.ts:176-177` при `data.length === prev.len` зовёт `updateData(id, data[last])` → при совпадающих крайних timestamp вся середина остаётся стухшей на экране. Фикс — fallback на `setSeriesData`, если не доказано, что середина не менялась.
6. **Нет dev-валидации данных**: несортированные timestamps молча пересортировываются (`data/store.ts:23-30`), out-of-order `append` молча превращается в overwrite последней точки (`:36-40`); единственный сигнал — одноразовый NaN/Infinity-warn (`utils/poisoned-data-reporter.ts:63`). Фикс — dev-only `console.warn` на пересортировку и downgrade аппенда.
7. **Нет тест-харнесса для потребителей**: рабочий canvas/ResizeObserver/matchMedia-стаб существует (`packages/react/test-setup.ts`), но deep-импортит приватные хелперы и не входит в exports map — пользователь в jsdom изобретает всё заново. Кандидат: subpath `@wick-charts/react/testing` с `installCanvasMock()`.
8. **`@wick-charts/core` — `private: true`** (`packages/core/package.json:3`): vanilla/other-framework пользователям нечего ставить; движок доступен только как re-export из обёрток. Решить: публиковать core или официально объявить `ChartInstance` из обёрток поддерживаемым vanilla-входом.

### Low

9. `addSeries('candlestick', …)` string-overload скрывает обязательный `registerBuiltinSeries()` — забыл → runtime throw (`chart.ts:499-520`); обёртки не страдают (передают Def-объекты), бьёт только по прямым пользователям core. Фикс — lazy-авторегистрация или убрать string-overload из публичного типа.
10. Vue/Svelte — ESM-only, React собирает dual ESM+CJS (`packages/react/vite.config.ts:23`) — либо выровнять, либо задокументировать как осознанное.

## План работ (если утверждаем)

Порядок: сначала P0-расширяемость + P0-DX (это и есть «прозрачный движок + понятный API»), потом P1.

**Статус на 2026-07-04: пп. 1–4 реализованы, протестированы, провалидированы (build/typecheck/biome/parity-checker зелёные), ещё не закоммичены.**

1. ✅ **Экспорт контракта серий + открытый kind** — `packages/core/src/index.ts`, `series/types.ts`, `series/definition.ts`; docs-страница «Custom series». Реализовано: `SeriesKind`/`SeriesType` открыты (`(string & {})`), `isTimeSeriesRenderer` теперь capability-check (не список kind), добавлен `CustomSpatialSeriesRenderer`, весь renderer-контракт (`SeriesRenderer`, `TimeSeriesRenderer`, `BaseSeriesRenderer`, `SeriesRenderContext`, `OverlayRenderContext`, `RenderPadding`, `XScale`, `YScale`, `BitmapCoordinateSpace`) экспортирован из core и всех трёх обёрток. Regression-тест — кастомная scatter-серия на публичных типах. Docs-страница `docs/pages/use-cases/custom-series.tsx` (не зарегистрирована в роутере — по конвенции репозитория для непроверенных explorer-страниц).
2. ✅ **События указателя**: `click`/`dblclick` эмитятся из `interactions/handler.ts` (включая synthesized tap-to-click для touch, т.к. `preventDefault` на touchstart блокирует нативный synthetic click), с подавлением при драге. `ChartInstance` эмитит `pointClick`/`pointDoubleClick` (с `spatialHit` для pie/heatmap/custom-spatial) и `seriesHover`; dblclick также вызывает `fitContent()` (ранее мёртвый код). Декларативные `onPointClick`/`onPointDoubleClick`/`onSeriesHover` во всех трёх обёртках, live-подписка (не mount-only, в отличие от `onEdgeReached`). Побочный фикс: время-серийный hit-test решён через существующие `getDataAtTime`/`buildHoverSnapshots` (nearest-point), а не через новую pixel-perfect геометрию — задокументировано как осознанное сужение объёма.
3. ✅ **Формат/тики осей**: `XScale.setFormat`/`getFormat` (симметрично `y-scale.ts:106`), `setLocale`/`getLocale`, `setTimeZone`/`getTimeZone`, `formatX()` как единая точка правды; `ChartOptions.locale`/`timeZone` + live `chart.setLocale`/`setTimeZone`. Кастомный tick-generator на ОБЕИХ шкалах (`XScale.setTickGenerator`, `YScale.setTickGenerator`) — bypass фиксированных tier-таблиц. Все 9 overlay-файлов (Crosshair/Tooltip/InfoBar × 3 фреймворка) переведены на `timeScale.formatX`. Сужение объёма: `tickGenerator` пока только императивный (`chart.timeScale.setTickGenerator(fn)`), без декларативного `<TimeAxis tickGenerator={fn}>` — не хватило бюджета в этой сессии.
4. ✅ **`animations` — deep-diff вместо teardown** во всех трёх обёртках. Общая утилита `deepEqual` в core (функции — по ссылке, всё остальное — рекурсивно), latch-паттерн в каждой обёртке. 6 regression-тестов (по 2 на фреймворк), каждый проверен на то, что реально ловит баг (временный revert → тест падает → откат обратно). JSDoc и dev-warning обновлены; закрыт `TODO(chart-core)` в `docs/pages/stress/streaming.tsx`.
5. **Generic options-diff** в series-компонентах React (Vue/Svelte уже diff-ят по identity — оставить); заодно закрывает `pulseMs` и разнобой array-диффов.
6. **Синхронизация экспортов** Vue/Svelte index + parity-checker на exports; доэкспортировать `VisibleRangeSpec`, `MultiLayerData`, `useThemeOptional`; добавить `EdgeLoader` в манифест.
7. **Декларативные колбэки + controlled range + `visible` на series.**
8. Наименование (`formatValue`→`format`), реактивность пропсов в JSDoc (включая правку `padding`-JSDoc — поведение уже live), PieTooltip/Tooltip симметрия.
9. ✅ **Быстрые фиксы до больших PR** — сделано: удалены съехавшие `@deprecated` (3 файла × 2 обёртки), `pulseMs` добавлен в dep-список LineSeries, устаревший комментарий в CandlestickSeries поправлен, `'use client'` banner добавлен в react/vite.config.ts, min-height:240px + README quickstart с явным height, JSDoc `perf` поправлен под текущий factory-API.
10. **Данные**: same-length swap в `data/sync.ts` + dev-warn'ы на пересортировку/downgrade аппенда.
11. **Testing subpath** `@wick-charts/react/testing` (потом Vue/Svelte).
12. **Решение по публикации `@wick-charts/core`** (или официальный vanilla-вход через обёртки).

Дополнительно (вне исходного плана, найдено и исправлено по пути): Vue `<ChartContainer>` был **некликабелен/непанорамируем/без crosshair по умолчанию** — Vue's boolean-casting превращал отсутствующий `interactive?: boolean` в `false`, а не `undefined`, при этом `gradient`/`headerLayout` этой ловушки избегали только за счёт явного default. Исправлено добавлением `interactive: true` в `withDefaults()`, с regression-тестом.

Пп. 1–3 — core; 4–7 — обёртки; каждый пункт — отдельный PR с тестами (recording-context spy для core, RTL для React).

## Verification

- `pnpm build && pnpm test` по пакетам; parity-checker (`scripts/check-api-parity.mjs`) зелёный после расширения на exports.
- Демо кастомной серии (scatter) на публичных типах — компилируется без deep-imports.
- Docs stress-test страница: клики по точкам логируются через новый `pointClick`.
- После п.9: `LineSeriesOptions` в IDE без зачёркивания; смена `pulseMs` на лету перезапускает пульс; README quickstart даёт видимый чарт в пустом CRA/Next-проекте.
