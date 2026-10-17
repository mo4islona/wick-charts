# Acceptance, triage, issues, coverage

The tech lead's half of a session. The teams produce claims; this step turns them into facts the
project can act on (GitHub issues), and into a coverage record the next session can build on.

## 1. Read the hand-backs, then the reports

Read each team's final message and `sessions/<id>/reports/<fw>.md` + `<fw>-findings.json`. Do not
read agent transcripts (they are huge). If a team stopped early, resume it with SendMessage rather than
starting a fresh agent — it keeps its context.

## 2. Cross-framework comparison

```
node .agents/skills/wick-charts-dogfood/scripts/compare.mjs --session <id> \
  --baseline test/dogfood/sessions/<previous-id>/compare
node .agents/skills/wick-charts-dogfood/scripts/compare.mjs --session <id> --state zoom
node .agents/skills/wick-charts-dogfood/scripts/compare.mjs --session <id> --state hover
```

Default render: look at every montage whose framework diff is above ~1% or that has console issues,
and at every baseline diff above ~0.5%. Interaction states (`compare-zoom/`, `compare-hover/`): look
at every montage — a stale axis is only a few hundred pixels (the Vue `animations` bug was a 0.32%
diff, all of it in the X labels), so the percentage is no filter there. For each difference decide:
- **wrapper bug** — the same props render differently; the core is shared, so a cross-framework diff
  is a wrapper (or a wrapper-default) problem until proven otherwise;
- **contract drift** — a team built the scenario differently (size, title, data); send it back;
- **noise** — animation phase (pulse dot, streaming), font hinting. Confirm by re-capturing with a
  longer `--wait` into a separate `--out` folder (a partial run overwrites `summary.json`).

In the first session every default-render diff above 1% turned out to be contract drift or noise
once re-checked, while `--state zoom` caught the Vue wrapper bug on its own. So treat the default
compare as a contract check, and the interaction states as the wrapper check.

Known source of React-only diffs: the React app runs in StrictMode (create-vite default), which
re-seeds series data. Compare against the team's `--nostrict` shots when a viewport differs.

## 3. Verify every P0 / P1 yourself

Reproduce each one from its `repro` + `evidence` with `shot.mjs` (hover / wheel / eval actions) or a
minimal snippet. Mark each finding `verified`, `rejected` (say why), or `known` (an open GitHub issue,
or a documented deferral — check `gh issue list --state all --search` before calling something new). P2/P3: spot-check a sample; trust but label as unverified.

## 4. Grade the teams

Short and factual, it calibrates the next brief: scenarios covered vs asked, evidence quality,
false-positive count, contract adherence, and one thing to change in the brief next time. Put brief
changes straight into `team-brief.md` — that is how the process improves.

## 5. BUGS.md (one entry per root cause, not per report)

`test/dogfood/sessions/<id>/BUGS.md`:

```
## B-03 Tooltip prints 0 for null values — P0, core
Frameworks: react, vue, svelte (R-01, V-04, S-02)
Evidence: shots/react/line-weather-nulls--hover.png, compare/line-weather-nulls.png
Root cause: packages/core/src/utils/format.ts:91 — formatPriceAdaptive(null) returns '0'
Status: new | known #123 | rejected (reason)
Probe: line-weather-nulls
Issue title: Tooltip shows 0 instead of a gap for null values
Labels: bug, P0, confirmed
```

BUGS.md and the team reports stay in the git-ignored session folder: they are working notes. Once
filed, the GitHub issue is the only record of a bug.

Order by severity, then by how many frameworks it hits. Merge duplicates across teams; a core bug
seen by three teams is one entry with three finding ids.

## 6. GitHub issues — only after the user approves the list

Issues are public: show the user the BUGS.md titles first and create only what they pick.
- Check for duplicates: `gh issue list --state all --search "<keywords>"`.
- Write in English. Body: what the user sees, minimal repro (code + data shape, not the dataset file),
  expected vs actual, root cause if verified, screenshot. No internal details beyond the repo itself,
  no session or agent bookkeeping, no "Generated with" line.
- Screenshots go to the orphan branch `issue-assets` under `dogfood/<session-id>/`, uploaded through the
  contents API (no worktree, no checkout):
  ```
  gh api -X PUT repos/mo4islona/wick-charts/contents/dogfood/<id>/<name>.png \
    -f branch=issue-assets -f message="docs: add dogfood screenshot" \
    -f content="$(base64 -i <file>)"
  ```
  and referenced as `https://raw.githubusercontent.com/mo4islona/wick-charts/issue-assets/dogfood/<id>/<name>.png`.
  Never delete that branch — the roadmap issues use it too.
- Labels: `bug`, one severity label (`P0` crash / blank / wrong numbers, `P1` misleading render or
  broken interaction, `P2` visual glitch, `P3` DX / docs papercut), and `confirmed` only when you
  reproduced it yourself. `coverage.mjs due --online` lists bugs closed since the last session and asks
  the next session to re-check each fix on the same data.
- Put the issue numbers into BUGS.md for this session's own bookkeeping.

## 7. Update the coverage map (the step that makes the next session smarter)

Edit `.agents/skills/wick-charts-dogfood/coverage.json`. It records what was tested and how — never
bug status, which is GitHub's job and would go stale after the first fix.
- **Session**: `commit` (HEAD at build time; `dirtyTree: true` if the library had uncommitted
  changes), `libVersion`, exact `frameworks` versions, `approach` (who ran what: agents, scenarios,
  compare states, probes) and `notes` — the lessons about the process, one line each.
- **Each probe that ran**: append the session id to `runs`. Refine `paths` when a root cause pointed
  somewhere else: `due` uses them to spot regression risk.
- **New probes** for features this session covered (`features: [sha]` stops `due` from flagging them),
  and for ideas that became scenarios.
- **Ideas**: add the teams' "new test ideas" and the angles you would try next, as `kind: "dataset"`
  (new data) or `kind: "angle"` (a new way to test), with a priority; remove ideas that became probes.
- **Datasets**: register new ones (quirk classes, fetch command), append the session to `usedIn`.

Then run `pnpm exec biome check --fix .agents/skills/wick-charts-dogfood` (a script-written
`coverage.json` needs Biome's JSON layout), `node .agents/skills/wick-charts-dogfood/scripts/coverage.mjs check`, and `due` to see the
starting point for next time. This session's `compare/` folder is the next session's `--baseline`.

## 8. Clean up

Stop the dev servers when the comparison and verification are done:
`lsof -tiTCP:5181,5182,5183 -sTCP:LISTEN | xargs kill`. If a team agent still shows as running after
its hand-back, its server was started as a background task — stop the agent with TaskStop.

## 9. Report to the user

Lead with the verdict per framework and the verified P0/P1 list. Offer the full write-up as an
Artifact page (screenshots, DX comparison table, bug list) — it is the natural place for montages.
