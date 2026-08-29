# Review — Stop the edge fade masking pie and heatmap charts (round 2)

## What changed since round 1

- `#rightFadeZone` (`chart.ts:3306`) now binds `this.#fade.right` to a local `const right` and
  branches on that local throughout, instead of re-reading `this.#fade.right` inside the ternary.
  This fixes the `TS2531` narrowing failure from round 1 without changing behavior — same
  conditions, same arithmetic, just a local binding TypeScript can track.
- `pnpm-workspace.yaml` dropped the stray placeholder `allowBuilds` block.
- A new test, "drops the automatic mask and column when its last time series is hidden"
  (`top-fade.test.tsx`), was added. It isn't one of `proposal.md`'s six declared Acceptance
  scenarios, so it doesn't get its own Matrix row, but it's the harness's only direct exercise of
  the "Risk" called out in the proposal's Key Points: hiding the last time series while a pie
  stays visible flips `yAxisWidth` and the mask off mid-frame. It passes.
- `proposal.md` itself is untouched — the stale "745 wide, not 757" text from round 1 is still
  there.

## Reading the diff against the specification

**Correctness of the fix.** `#isSpatialOnly()` (`chart.ts:1641`) — `this.#series.length > 0 &&
!this.#hasTimeSeries()` — is exactly the predicate the proposal specifies: a populated chart with
no visible time series. `yAxisWidth` (`chart.ts:370`) and `#rightFadeZone` (`chart.ts:3306`) both
consult it, and both respect an explicit override first (`y?.width !== undefined` /
`right === null` check) before falling back to the automatic collapse — matching "an explicit
value... also works on spatial-only charts" from the options.ts TSDoc. The three series-mutation
call sites that can flip `#isSpatialOnly()`'s answer — `addSeries` (`chart.ts:702`), `removeSeries`
(`chart.ts:720`), `setSeriesVisible` (`chart.ts:1288`) — all snapshot `yAxisWidth` before the
mutation and call `#syncYAxisWidth` after, which only does the (relatively expensive)
`syncScales()` + dirty-marking + `viewportChange` emit when the value actually changed. That's the
right shape: no redundant rescale on every series toggle, only on the ones that cross the
spatial-only boundary.

**The fixed TS error.** Confirmed by direct reading, not just the tsc run: `right` is a `const`
bound once at the top of the function body and never reassigned, so every read of it downstream is
provably the same value TypeScript already narrowed at the `right === null` check — this is a
correct fix, not a suppression.

**Scope discipline.** The diff still touches exactly what the proposal says it will: the one
predicate and its call sites in `chart.ts`, the `FadeConfig.right` / `YAxisConfig.width` TSDoc, the
regenerated manifest, and the test file. Nothing in `ChartContainer.tsx` beyond the doc-comment
change quoted in the diff.

## Remaining findings

- `proposal-acceptance-stale-geometry` (minor, carried over from round 1, unresolved) —
  `proposal.md:68` still says the pane clip should be "745 wide, not 757" for the pie-only
  scenario, which is the `fade-only` scope's number. `decisions.md` records the owner picking the
  wider `collapse-column` scope, and the shipped/tested behavior (`yAxisWidth === 0`,
  `chartArea.width === 800`) matches that decision, not this stale figure. Purely a proposal.md
  wording issue — the code and tests are correct against the more authoritative, later decision.
  Recommend a follow-up edit to `proposal.md` to replace "745 wide, not 757" with "800 wide, not
  757" (or drop the specific numbers and just assert `yAxisWidth === 0`). Not blocking — nothing in
  the codebase or its behavior needs to change for this.

No new findings from this round's reading pass. Both round-1 blocking/minor code findings are
fixed and confirmed by direct code reading plus a clean `tsc --noEmit` run.

## Verdict rationale

Both lenses agree: the Matrix is fully green (six declared scenarios, six passing individually-run
assertions), the round-1 blocking build break is gone, the fix is a correct, minimal, in-scope
change, and the only outstanding item is a non-blocking documentation staleness note that doesn't
touch behavior or tests. `approve`.
