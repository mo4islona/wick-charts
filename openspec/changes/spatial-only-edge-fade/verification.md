# Verification — Stop the edge fade masking pie and heatmap charts

## Environment note

`git` is unusable in this workspace (`fatal: not a git repository` — the worktree's gitdir
under `/var/lib/specmate/workspaces/mirrors/...` does not exist on disk). This did not block
execution: the working tree already contains the branch's files, and every check below (vitest,
`tsc --noEmit`, `biome check`, `pnpm approve-builds`-adjacent `pnpm install`, `node
scripts/extract-api.mjs`, `node scripts/check-api-parity.mjs`) runs directly against those files
without needing git. No diffing against `main` was possible; I verified content against the
diff already recorded in the task ledger instead.

## What was run

- `node_modules/.bin/vitest run packages/react/src/__tests__/integration/top-fade.test.tsx` — full
  file, then once per acceptance scenario with `-t "<test name>"` for the Matrix rows below.
- `node_modules/.bin/vitest run packages/react/src/__tests__/integration/spatial-scroll-passthrough.test.tsx packages/core/src/__tests__/renderers/pie*` —
  the adjacent suites the task ledger's harness-coverage note names.
- `node_modules/.bin/vitest run` (full suite, 228 files) — one file failed:
  `docs/__tests__/useSettings.test.ts`, all 4 tests, with `TypeError: Cannot read properties of
  undefined (reading 'clear')` on `localStorage.clear()`, plus a Node
  `ExperimentalWarning: localStorage is not available because --localstorage-file was not
  provided.` This file is untouched by the diff, its failure is Node/environment-version-specific
  (Node's built-in `localStorage` global shadowing the test's expected polyfill) and unrelated to
  fade/axis geometry — not counted against this change's scenarios.
- `node_modules/.bin/tsc --noEmit` — **fails**: `packages/core/src/chart.ts(3319,96): error
  TS2531: Object is possibly 'null'.` This is the only error in the whole repo and sits directly
  in the line this diff rewrote. Detail in `review.md` / `findings`.
- `node_modules/.bin/biome check <changed files>` — clean, no issues.
- `node scripts/extract-api.mjs` then `diff` against the committed `docs/data/api-manifest.json` —
  byte-identical; the manifest in the diff was genuinely regenerated, not hand-edited to drift.
- `node scripts/check-api-parity.mjs` — all 24 components in parity across react/vue/svelte.
- `corepack pnpm install --frozen-lockfile` in the actual workspace — fails with
  `[ERR_PNPM_IGNORED_BUILDS]`. To isolate whether the branch's `pnpm-workspace.yaml` addition
  (`allowBuilds: { esbuild: "set this to true or false", puppeteer: "set this to true or false" }`)
  caused this, I copied the manifests (`package.json`, `pnpm-lock.yaml`, every workspace
  `package.json`) into a scratch directory with that block stripped back to the two-line
  `packages:` list and reran the same command: **same failure, same two packages**. The block is
  inert either way — pnpm's `allowBuilds` handling does a strict `=== true` / `=== false` switch,
  and the placeholder string matches neither, so it neither approves nor blocks the two ignored
  builds. Not a regression this diff introduces; flagged in `review.md` as leftover, non-functional
  scope creep regardless.

## Matrix

| Scenario | Assertion | Outcome |
| --- | --- | --- |
| Pie-only chart draws no right edge fade | `vitest run packages/react/src/__tests__/integration/top-fade.test.tsx -t "keeps pie-only charts clear of the automatic X mask and Y-axis column"` | pass |
| Heatmap-only chart draws no right edge fade | `vitest run packages/react/src/__tests__/integration/top-fade.test.tsx -t "keeps heatmap-only charts clear of the automatic X mask and Y-axis column"` | pass |
| Time-series chart keeps the default mask | `vitest run packages/react/src/__tests__/integration/top-fade.test.tsx -t "headerless default: no top mask, X mask rides under the axis column"` | pass |
| Mixed chart keeps the default mask | `vitest run packages/react/src/__tests__/integration/top-fade.test.tsx -t "keeps the automatic mask and column when a spatial chart also has a time series"` | pass |
| Explicit fade.right still applies to a pie-only chart | `vitest run packages/react/src/__tests__/integration/top-fade.test.tsx -t "keeps an explicit right fade on a pie-only chart at its full-width edge"` | pass |
| A chart with no series keeps the default mask | `vitest run packages/react/src/__tests__/integration/top-fade.test.tsx -t "keeps the automatic mask for an empty chart"` | pass |

Every declared acceptance scenario in `proposal.md` has a passing, individually-run assertion.
That is necessary, not sufficient — see `review.md` for the reading pass, which surfaces a build
break (`tsc --noEmit`) that this matrix cannot show because none of the repository's test/lint
scripts type-check as part of running.

### Scenario 1 numeric caveat

The "Pie-only" scenario's own text in `proposal.md` says the pane clip should be "745 wide, not
757" — i.e. `yAxisWidth` staying at 55 and only the fade's intrusion-widening backing off. The
actual (and tested) behavior is `yAxisWidth === 0` / pane clip `800` wide, matching the
"collapse-column" scope the owner answered in `decisions.md` (dated the same day) rather than the
"fade-only" scope `proposal.md`'s Acceptance section was written against. I ran the scenario's
*substantive* claim — no right-edge fade on a pie-only chart — which holds; I did not fail the row
over the stale `745`/`757` figures, since the implementation correctly follows the more
authoritative, later-recorded decision. See `review.md` for why this is still worth fixing in
`proposal.md`.
