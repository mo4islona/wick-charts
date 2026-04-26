# API parity TODO

Pre-existing drift between `@wick-charts/react` (the canonical surface) and the Vue/Svelte ports. Surfaced by `pnpm api:check` (`scripts/check-api-parity.mjs`) — the script gates `pnpm test`, so this file is the punch list to drain before CI goes green again.

> Generated from the live parity diff, not by hand. Re-run `pnpm api:check` after each fix to see what's left.

## How to attack this

For each component below, open the React source and the corresponding Vue / Svelte file side-by-side. Mirror the missing prop's name, optionality, and type. Where the type comes from `@wick-charts/core`, the import already exists in the `.vue` / `.svelte` file — just add the prop entry to `defineProps<{...}>()` (Vue) or as `export let foo: T = default` (Svelte).

After each component is fixed: `pnpm api:check` should drop the count, `pnpm api:extract` regenerates the manifest, and the React docs page automatically reflects any added JSDoc.

---

## 1. Series components — `data` is required in React, optional in Svelte

| Component | React | Svelte |
| --- | --- | --- |
| `LineSeries` | `data: TimePoint[][]` | `data: TimePoint[][] = []` |
| `BarSeries` | `data: ...` | `data = []` |
| `CandlestickSeries` | `data: ...` | `data = []` |
| `PieSeries` | `data: ...` | `data = []` |

**Fix:** drop the `= []` initializer in each Svelte series file. Mirroring React forces consumers to be explicit and matches the documented API.

Files: `packages/svelte/src/{LineSeries,BarSeries,CandlestickSeries,PieSeries}.svelte`

(Vue is already correct here — `data` is required in all four `defineProps`.)

---

## 2. `ChartContainer` — five props missing in both Vue and Svelte

React adds these on top of `theme` / `axis` / `grid` / `style` / `className`:

```ts
gradient?: boolean;          // show the chart background gradient (default true)
interactive?: boolean;       // enable zoom/pan/crosshair (default true)
headerLayout?: 'overlay' | 'inline';
padding?: { top?: number; bottom?: number; right?: number | { intervals: number }; left?: number | { intervals: number } };
perf?: NonNullable<ChartOptions['perf']>;
```

**Fix:** add all five to:

- `packages/vue/src/ChartContainer.vue` → `defineProps<{...}>()`
- `packages/svelte/src/ChartContainer.svelte` → `export let ...`

In both, route the values into the underlying `ChartInstance`/`createChart` config the same way React does in `packages/react/src/ChartContainer.tsx`.

---

## 3. `TimeAxis` and `YAxis` — density overrides missing

React lets a single axis override the chart-level label density:

```ts
labelCount?: number;           // overrides axis.{x,y}.labelCount
minLabelSpacing?: number;      // px floor — overrides chart-level
```

Both props missing in Vue and Svelte for both axes.

Files:
- `packages/vue/src/ui/TimeAxis.vue`
- `packages/vue/src/ui/YAxis.vue`
- `packages/svelte/src/ui/TimeAxis.svelte`
- `packages/svelte/src/ui/YAxis.svelte`

The plumbing on the React side is `chart.setYAxisLabelDensity(...)` (and the corresponding X equivalent) — call those from the watch effect / lifecycle in each port.

---

## 4. `PieLegend.position` missing in Vue and Svelte

React: `position?: PieLegendPosition` (`'bottom' | 'right' | 'overlay'`).

Files: `packages/vue/src/ui/PieLegend.vue`, `packages/svelte/src/ui/PieLegend.svelte`.

---

## 5. `Title.sub` — type narrowed in Vue/Svelte

React allows arbitrary `ReactNode` (so a `<span>` with a tag, an icon, etc.). Vue declares `string`; Svelte declares `string | undefined`.

**Fix options:**
- Cleanest: change Vue/Svelte to accept the framework's equivalent of "rich content" via a slot (`<slot name="sub">`) and remove the `sub` prop from the public surface there. Then add `'sub'` to `FRAMEWORK_CONVENTION_PROPS` in `scripts/check-api-parity.mjs`.
- Or: keep it as a string-only prop everywhere by changing React's `sub?: ReactNode` to `sub?: string`. Easier, but loses expressiveness for React users who already pass markup.

Decision goes to whoever drains this list — leaning toward the slot approach for Vue/Svelte.

Files: `packages/react/src/ui/Title.tsx`, `packages/vue/src/ui/Title.vue`, `packages/svelte/src/ui/Title.svelte`.

---

## 6. `NumberFlow.format` — `Intl.NumberFormatOptions` overload missing

React: `format?: ((v: number) => string) | Intl.NumberFormatOptions`.

Vue and Svelte only accept the formatter function.

**Fix:** widen the Vue/Svelte type to the union, and route an `Intl.NumberFormatOptions` value through `new Intl.NumberFormat(locale, options).format` internally — same as React does.

Files: `packages/vue/src/ui/NumberFlow.vue`, `packages/svelte/src/ui/NumberFlow.svelte`.

---

## 7. `Legend.mode` — Svelte type-alias drift (cosmetic)

React/Vue: `mode?: LegendMode` (an exported type alias).
Svelte: `mode?: 'isolate' | 'solo' | 'toggle'` (the alias inlined).

**Fix:** in `packages/svelte/src/ui/Legend.svelte`, import `LegendMode` from `@wick-charts/core` and use the alias by name. No behavioural change — the union resolves to the same set.

---

## After this list is empty

1. `pnpm api:check` exits 0.
2. `pnpm test` runs without the parity gate getting in the way.
3. Delete this file.
4. Optional: tighten the parity checker — e.g. require that React and Vue/Svelte share the same imported type *name* by default (today it tolerates structurally-equal inline unions to keep noise down). With the source aligned, the checker can become stricter.

## Categories of allowed divergence (don't touch)

The checker already ignores these by design — keep them this way:

- `children` — React render-prop / React-children. Vue uses `defineSlots`; Svelte uses `<slot>`. Documented under "Render prop" / "Slots" on the API page.
- `className` / `style` — React idiom. Vue/Svelte fall-through attributes (`class=`, `style=`).
- `Sparkline` — intentionally React-only (composite chart). Listed in the script's `REACT_ONLY` set.
