# Bundle Size Minimization Plan

> **Status (2026-06-11): Steps 1, 2, 3 and 5 are implemented.** Measured after
> each step (`pnpm build && pnpm size`, candlestick-only scenario, raw/gzip):
>
> | After step                       | raw      | gzip    |
> | -------------------------------- | -------: | ------: |
> | baseline                         | 175.6 kB | 52.9 kB |
> | 1 — `target: 'es2022'`           | 160.2 kB | 49.1 kB |
> | 2 — `preserveModules`            | 146.0 kB | 45.0 kB |
> | 3 — ChartContainer slot markers  | 122.4 kB | 38.1 kB |
> | 5 — renderer injection           | **88.1 kB** | **27.5 kB** |
>
> Net: **−50% raw / −48% gzip** for the minimal scenario; react-full went
> 192.7 → 179.8 kB raw (57.9 → 55.2 gzip). Step 4 (perf decoupling, ~5 kB)
> remains open.

## 1. Problem

Tree-shaking is effectively broken for consumers. Measured with `pnpm size`
(esbuild scenarios over the published `dist`, minify + gzip level 9):

| react scenario   |      raw |    gzip |  brotli |
| ---------------- | -------: | ------: | ------: |
| candlestick-only | 175.6 kB | 52.9 kB | 45.2 kB |
| line-only        | 175.6 kB | 53.0 kB | 45.1 kB |
| react-full       | 192.7 kB | 57.9 kB | 49.3 kB |

A consumer importing only `CandlestickSeries` pays 91% of the full library.
Per-module attribution (esbuild metafile, built from source, minified bytes)
shows ~58 kB of code that a candlestick-only app never executes:

| Dead weight in candlestick-only                                        | min, raw |
| ---------------------------------------------------------------------- | -------: |
| Unused series: `line.ts` + `pie.ts` + `bar.ts` + `base-multi-layer.ts`  |   ~32 kB |
| Navigator stack: `controller` + `render` + `interactions` + `decimate`  | ~13.5 kB |
| React UI never rendered: `Legend` + `InfoBar` + `PieLegend`              |  ~7.5 kB |
| Perf instrumentation: `perf-monitor` + `perf-hud` + `counting-context`   |  ~5.2 kB |

On top of that, the published dist is down-leveled below es2022 (Vite default
target), so every `#private` field access compiles to a WeakMap-helper call:
full react bundle measures **178.8 kB raw / 54.2 kB gzip at es2022** vs
**196.7 / 58.6 at the Vite default** — an 18 kB raw / 4.4 kB gzip tax, plus a
runtime cost on every field access.

**Target: candlestick-only ≈ 90–100 kB raw (~30 kB gzip), down ~45%.**

## 2. Root causes

1. **`Chart#createRenderer` hard-imports all four renderers** —
   `chart.ts:33-36` imports `BarRenderer` / `CandlestickRenderer` /
   `LineRenderer` / `PieRenderer`; `addSeries(type)` selects via a string
   switch. Every renderer is reachable from `Chart`, so nothing shakes.
2. **`ChartContainer` imports every UI component for child-splitting** —
   `ChartContainer.tsx:28-31` imports `InfoBar`, `Legend`, `PieLegend`,
   `Navigator` only to match `child.type === Navigator`. The `Navigator`
   import transitively retains the whole core navigator stack.
3. **No `build.target` in any `vite.config.ts`** — Vite's default
   (`'modules'`, includes safari14) lowers `#private` fields/methods to
   helper calls.
4. **`chart.ts` unconditionally imports `PerfHud`** even though perf
   instrumentation is off by default.
5. **Flat single-file dist** — the same scenario bundles to 149.6 kB from
   source vs 175.6 kB through the flat `dist/index.js`; a pre-bundled file
   tree-shakes worse in the consumer's bundler than per-module ESM output.

Note: the barrels themselves are clean — `sideEffects: false` works, unused
themes (e.g. `handwritten`) do shake from source. The problem is the hard
import edges above, not the exports.

## 3. Plan

Ordered by risk/effort. Steps 1–2 are config-only; 3–4 are local refactors;
5 is a public-API change and should land in a minor release.

### Step 1 — `build.target: 'es2022'` (one line × 4 configs)

Add `build: { target: 'es2022' }` to all four `packages/*/vite.config.ts`.
Keeps native `#private` fields in the dist.

- Win: −18 kB raw / −4.4 kB gzip on everything, plus runtime speedup.
- Risk: drops Safari < 16.4-ish for the *prebuilt* dist; consumers with
  older targets re-transpile in their own build anyway. Document the floor
  in the READMEs.
- Verify: `pnpm build && pnpm size`; `grep -c __privateGet dist` → 0.

### Step 2 — publish per-module ESM (`preserveModules`)

In each lib build, set `rollupOptions.output.preserveModules: true` (keep a
flat `index.cjs` for the CJS entry if desired). `sideEffects: false` is
already in place, so consumer bundlers can shake per module.

- Win: closes most of the flat-dist penalty (~26 kB raw on the minimal
  scenario today; smaller after Step 1, still meaningful).
- Risk: `vite-plugin-dts` with `rollupTypes: true` is unaffected (types stay
  rolled up); check that the bundle-size script's `alias: dist/index.js`
  measurement still resolves internal chunks. Update `files` globs if the
  dist layout changes.
- Verify: `pnpm size` scenario delta between candlestick-only and
  react-full should widen (shaking works again).

### Step 3 — break the `ChartContainer` → UI component import edges

Replace `child.type === Navigator` (and Legend / PieLegend / InfoBar / Title
equivalents) with a static slot marker carried by each component:

```ts
// ui/Navigator.tsx
Navigator.__wickSlot = 'navigator' as const;

// ChartContainer.tsx — no Navigator import
const slot = (child.type as { __wickSlot?: string }).__wickSlot;
if (slot === 'navigator') { ... }
```

Mirror the same change in the Vue and Svelte wrappers where they do
component-identity matching.

- Win: ~21 kB raw off any app without a navigator (UI components ~8 kB +
  core navigator stack ~13.5 kB).
- Risk: low — marker is internal; keep the `child.type` check as a fallback
  during one release if third-party wrappers re-export our components.
- Verify: metafile of candlestick-only no longer lists
  `navigator/controller.ts`, `ui/Legend.tsx`, `ui/InfoBar.tsx`.

### Step 4 — decouple perf instrumentation

Stop importing `PerfHud` in `chart.ts`. The monitor is already injected via
`options.perf`; move HUD construction out of the chart — export `PerfHud`
(or an `attachPerfHud(chart, container)` helper) from `@wick-charts/core`
and let the docs/playground attach it explicitly.

- Win: ~5 kB raw; also removes a DOM-heavy module from the hot path's
  import graph.
- Risk: breaking only for users of `perf.showHud` — keep the option but
  implement it via a dynamic `import()` for one release, or document the
  migration in MIGRATION.md.

### Step 5 — renderer injection instead of the `addSeries(type)` switch

Invert the dependency: the caller supplies the renderer, the chart stops
knowing concrete series types.

```ts
// core — new primary API
chart.addSeries({ renderer: SeriesRenderer, id?, label? }): string

// react/vue/svelte wrappers — each component imports only its renderer
// CandlestickSeries.tsx
const renderer = new CandlestickRenderer(new TimeSeriesStore<OHLCData>(), {
  ...themeDefaults, ...options,
});
chart.addSeries({ renderer, id });
```

Design notes:

- Theme-default merging currently lives in `Chart#createRenderer`
  (`chart.ts:449`). Move it into per-type factory helpers exported from
  core (`createCandlestickRenderer(theme, opts)` etc.) so wrappers don't
  duplicate the merge order (theme → animation defaults → user options →
  forced overrides). The factories are what the framework components
  import — that's the tree-shake boundary.
- `AnimationConfig.defaults(type)` / `.overrides(type)` keyed by string
  type: pass the type string along inside the factory, not via the chart.
- Keep the string-based `addSeries('line', …)` overloads working for
  vanilla-core users, but move them to a separate export (e.g.
  `@wick-charts/core/all` or an `installAllSeries(chart)` helper) so the
  main entry no longer reaches all renderers. Mark the old path
  `@deprecated`, document in MIGRATION.md.
- Update the wick-charts skill docs and llms-full after the API change.

- Win: ~32 kB raw off single-series apps; `chart.ts` loses the switch, the
  four overloads, and per-type theming knowledge (it's the largest module
  at 2190 lines / 19.2 kB min — this is also a code-simplification win).
- Risk: public API change → minor release; all three wrappers + docs +
  skill touched. The viewport-engine refactor in progress also edits
  `chart.ts` — coordinate to avoid conflicts.
- Verify: metafile of candlestick-only lists no `series/line.ts`,
  `series/pie.ts`, `series/bar.ts`, `series/base-multi-layer.ts`.

## 4. Expected end state

| react scenario   | today (raw) | projected (raw) | projected (gzip) |
| ---------------- | ----------: | --------------: | ---------------: |
| candlestick-only |    175.6 kB |       ~90–100 kB |          ~30 kB |
| react-full       |    192.7 kB |        ~175 kB   |          ~52 kB |

## 5. Measurement discipline

- `pnpm build && pnpm size` before/after every step; record numbers in the
  step's commit message.
- For attribution, build the scenario from source with an esbuild metafile
  (alias `@wick-charts/react` → `packages/react/src/index.ts`,
  `@wick-charts/core` → `packages/core/src/index.ts`) and diff the
  per-module byte list.
- Consider adding a CI size budget once Steps 1–3 land (fail if
  candlestick-only gzip regresses by >2%).
