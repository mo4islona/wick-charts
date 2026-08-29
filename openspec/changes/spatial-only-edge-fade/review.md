# Review — Stop the edge fade masking pie and heatmap charts

## Summary

The behavioral change is sound and well-tested: `#isSpatialOnly()` correctly reuses
`#hasTimeSeries()` (the same predicate already gating `canPanZoom`/the crosshair), gates both the
`yAxisWidth` getter and `#rightFadeZone`'s automatic branch, and the `#syncYAxisWidth` guard at
every series mutation site (`addSeries`, `removeSeries`, `setSeriesVisible`) keeps scales/scheduler
state consistent when the column appears or disappears live. I traced every other consumer of
`yAxisWidth` (`navigator/controller.ts`, `YAxis.tsx`, `TimeAxis.tsx`, `YLabel.tsx`, `Tooltip.tsx`,
`getLayout()`) and each either recomputes it live off `chart.yAxisWidth` on a render/subscription
path that already fires on the events this diff emits (`overlayChange` via the pre-existing
`#bumpOverlayVersion()` calls in the same three methods covers the navigator's canvas resize; the
new `viewportChange` emit covers the React DOM components via `store-bridge.ts`), or is unaffected.
No caching of `yAxisWidth` anywhere goes stale.

That said, this passes the mechanical bar and still does not get an `approve`: a real build break
survives, and there is at least one piece of scope creep worth removing before merge.

## Findings

### 1. `tsc --noEmit` fails — blocking

`packages/core/src/chart.ts:3319`:

```ts
const automatic = this.#fade.right === null;
...
const total = automatic ? intrusion + Math.round(RIGHT_FADE_LEAD_IN_PX * hpr) : Math.round(this.#fade.right * hpr);
```

`error TS2531: Object is possibly 'null'.` The old code inlined the null check directly in the
ternary condition (`this.#fade.right === null ? ... : ... this.#fade.right ...`), which TypeScript
narrows correctly. Refactoring the condition out into a separately-computed `automatic` boolean
breaks that narrowing — TS does not propagate nullability facts through an intermediate `boolean`
variable, so `this.#fade.right` in the `else` branch is still typed `number | null`. This is the
*only* type error in the entire repository (confirmed via a clean `tsc --noEmit` run) and CI runs
exactly this check on every PR (`.github/workflows/pr.yml:33`, `pnpm typecheck`). None of the
project's other gates catch it: `biome check` doesn't type-check, and `vitest` transpiles through
esbuild without type-checking, so the 26/26 green tests in `top-fade.test.tsx` give no signal here
— this is precisely the class of defect the second lens exists to catch and the first can't.

The project's own conventions (`CLAUDE.md`: no `!` non-null assertion) rule out the easy fix.
The straightforward correct fix is binding `this.#fade.right` to a local once and branching on
that local, e.g. `const right = this.#fade.right; ... const total = right === null ? ... :
Math.round(right * hpr);` — narrowing survives through a `const` alias of the same expression.

### 2. `pnpm-workspace.yaml` gained an unrelated, non-functional block — minor, but should be reverted

```yaml
allowBuilds:
  esbuild: set this to true or false
  puppeteer: set this to true or false
```

Nothing in `proposal.md` or `tasks.md` touches package-manager config, and this has no connection
to fade geometry or Y-axis width. It also does not do what its shape implies: pnpm's `allowBuilds`
consumer switches on `value === true` / `value === false`; the literal placeholder string matches
neither arm, so both `esbuild` and `puppeteer` stay in the same "undecided" state they'd be in
without this block at all (confirmed empirically — see `verification.md`). It reads as a
half-finished `pnpm approve-builds` scaffold that was accidentally committed instead of filled in
or discarded. It should come out of this branch; it isn't observed to break `pnpm install` any
differently than baseline in this sandbox, but it's dead config that will confuse the next person
who reads it expecting it to mean something.

### 3. `proposal.md`'s Acceptance scenario 1 has stale geometry — minor, documentation only

"Pie-only chart draws no right edge fade" specifies "the pane clip rect is 745 wide, not 757" —
that number is only correct under the "fade-only" scope (`yAxisWidth` staying 55, only the
intrusion-widening backing off). `decisions.md` records the owner answering "Also auto-collapse the
Y-axis column" the same day, and `tasks.md` ("collapse the automatic Y-axis column for
spatial-only charts") and the actual shipped/tested behavior (`yAxisWidth === 0`,
`chartArea.width === 800`) all agree with the *later* decision, not the Acceptance text. Nothing
here indicates the code is wrong — the decision is dated after and clearly supersedes the
recommended default the Acceptance section was originally written against — but `proposal.md` was
never updated to match, so a future reader comparing the shipped behavior against this proposal's
own numbers will see a mismatch and reasonably wonder which one is authoritative. Worth a follow-up
edit to `proposal.md` so the artifact is internally consistent.

### 4. Unrelated pre-existing test failure — informational, not counted against this change

`docs/__tests__/useSettings.test.ts` (4 tests) fails in this sandbox with
`TypeError: Cannot read properties of undefined (reading 'clear')` on the global `localStorage`,
alongside a Node `ExperimentalWarning` about `--localstorage-file`. This file has nothing to do
with charts, axes, or fades, and the failure mode (Node's built-in `localStorage` global vs. a
jsdom/happy-dom polyfill the test expects) is an environment/Node-version artifact, not something
this diff touches or could have caused.

## Coverage read against the diff

Every predicate change in `chart.ts` (`yAxisWidth` getter, `#isSpatialOnly`, `#rightFadeZone`'s new
early return, `#syncYAxisWidth` at all three call sites) has a corresponding assertion in
`top-fade.test.tsx`, including the live-toggle path (`drops the automatic mask and column when its
last time series is hidden`), which is the one most likely to have a stale-state bug and is
exactly the case the proposal's own "Risk" section calls out. I don't see an uncovered scenario
from `proposal.md`; the six declared Acceptance scenarios all have a direct, passing test.
