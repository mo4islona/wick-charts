# Verification — Stop the edge fade masking pie and heatmap charts (round 2)

## Environment note

`git` is still unusable in this workspace (`fatal: not a git repository` — the worktree's gitdir
under `/var/lib/specmate/workspaces/mirrors/...` does not exist on disk). As in round 1, this did
not block execution: every check below runs directly against the working tree's files. No
diffing against `main` was possible; the round-1 findings were re-checked by reading the current
file contents directly.

## Round-1 findings re-checked

- `rightfadezone-tsc-null-narrowing` (blocking) — **fixed**. `chart.ts:3311` now binds
  `const right = this.#fade.right;` and every subsequent branch (`chart.ts:3312`, `3315`, `3319`)
  reads the local `right`, so TypeScript narrows it to `number` in the `: Math.round(right * hpr)`
  arm. `tsc --noEmit` (full repo, no path filter) now exits clean — zero errors, where round 1 had
  exactly one (`TS2531` at this same line).
- `pnpm-workspace-allowbuilds-placeholder` (minor) — **fixed**. `pnpm-workspace.yaml` is back to
  its two-line `packages:` list; the placeholder `allowBuilds` block is gone.
- `proposal-acceptance-stale-geometry` (minor) — **not fixed**, still present.
  `proposal.md`'s "Pie-only chart draws no right edge fade" scenario (line 68) still reads "the
  pane clip rect is 745 wide, not 757", which is the superseded `fade-only` scope's number. The
  shipped/tested behavior is `yAxisWidth === 0` / pane clip `800` wide (the `collapse-column`
  scope the owner picked in `decisions.md`), which is what the harness actually asserts and what
  passes below. This was filed as a doc-only follow-up in round 1, not a code defect, and remains
  exactly that — recorded again in `review.md` since it wasn't addressed, but not blocking.

## What was run

- `node_modules/.bin/tsc --noEmit` — clean, no errors (see above).
- `node_modules/.bin/biome check` on every file the diff touches — clean, no issues.
- `node_modules/.bin/vitest run packages/react/src/__tests__/integration/top-fade.test.tsx` — full
  file (26 tests, up from round 1's 20 — a new test, "drops the automatic mask and column when its
  last time series is hidden", was added), then once per acceptance-scenario assertion with
  `-t "<test name>"` for the Matrix rows below.
- `node_modules/.bin/vitest run packages/react/src/__tests__/integration/spatial-scroll-passthrough.test.tsx packages/core/src/__tests__/renderers/pie*` —
  110 tests, all pass, including `spatial-scroll-passthrough`'s own
  "hiding the only time series flips the chart to pass-through and back", which exercises the same
  `#syncYAxisWidth` path as the new top-fade test above from a different angle.
- `node_modules/.bin/vitest run` (full suite, 228 files) — same single pre-existing failure as
  round 1: `docs/__tests__/useSettings.test.ts`, all 4 tests, `TypeError: Cannot read properties of
  undefined (reading 'clear')` on `localStorage.clear()`. Untouched by this diff, unrelated to
  fade/axis geometry, environment-specific (Node's built-in `localStorage` vs. the test's expected
  polyfill) — not counted against this change's scenarios. 1889 passed, 4 failed (same 4 as before),
  1 file failed (same file as before).
- `node scripts/extract-api.mjs` then diffed the new `docs/data/api-manifest.json` output against
  what was already committed by reading both — the `FadeConfig.right` and `YAxisConfig.width`
  description strings in the regenerated file match the source TSDoc in `chart/options.ts` and
  `types.ts` verbatim; regeneration is stable and not hand-edited to drift.
- `node scripts/check-api-parity.mjs` — all 24 components in parity across react/vue/svelte.

## Matrix

| Scenario | Assertion | Outcome |
| --- | --- | --- |
| Pie-only chart draws no right edge fade | `vitest run packages/react/src/__tests__/integration/top-fade.test.tsx -t "keeps pie-only charts clear of the automatic X mask and Y-axis column"` | pass |
| Heatmap-only chart draws no right edge fade | `vitest run packages/react/src/__tests__/integration/top-fade.test.tsx -t "keeps heatmap-only charts clear of the automatic X mask and Y-axis column"` | pass |
| Time-series chart keeps the default mask | `vitest run packages/react/src/__tests__/integration/top-fade.test.tsx -t "headerless default: no top mask, X mask rides under the axis column"` | pass |
| Mixed chart keeps the default mask | `vitest run packages/react/src/__tests__/integration/top-fade.test.tsx -t "keeps the automatic mask and column when a spatial chart also has a time series"` | pass |
| Explicit fade.right still applies to a pie-only chart | `vitest run packages/react/src/__tests__/integration/top-fade.test.tsx -t "keeps an explicit right fade on a pie-only chart at its full-width edge"` | pass |
| A chart with no series keeps the default mask | `vitest run packages/react/src/__tests__/integration/top-fade.test.tsx -t "keeps the automatic mask for an empty chart"` | pass |

Every declared acceptance scenario in `proposal.md` has a passing, individually-run assertion,
same as round 1. The build-break finding that made round 1's matrix insufficient (`tsc --noEmit`
failing) is resolved — `tsc --noEmit` is clean this round, and both fixed findings are gone from
the diff. See `review.md` for the reading pass.

### Scenario 1 numeric caveat (unchanged from round 1)

The "Pie-only" scenario's own text in `proposal.md` still says "745 wide, not 757" — the
`fade-only` scope's number, superseded the same day by the owner's `decisions.md` answer choosing
`collapse-column`. The harness asserts the scenario's substantive claim (no right-edge fade, and
`yAxisWidth === 0` / `chartArea.width === 800`, matching the `collapse-column` scope) rather than
the stale `745`/`757` figures, which is why the row above reads `pass` rather than being marked
against the literal Acceptance text. This is a proposal.md staleness issue, not a code defect —
see `review.md`.
