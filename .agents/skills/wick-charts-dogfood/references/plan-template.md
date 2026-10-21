# Dogfood session {SESSION}

Goal: build the selected scenarios on **real, messy data** and find out (1) how easy the library is
to install and wire up, (2) whether every chart renders correctly, (3) what is missing, and (4) where
the framework wrappers behave differently.

Session focus: _<one line from the tech lead: why this session, which `coverage.mjs due` items it covers>_

## Layout

```
test/dogfood/                      git-ignored, persistent on this machine
  data/                            dataset snapshots + CATALOG.md (read-only for teams)
  tools/frame.css                  shared page CSS (copied from the skill by setup.mjs)
  react/  vue/  svelte/            persistent apps — extend them, do not rebuild from scratch
  sessions/{SESSION}/
    PLAN.md                        this file
    shots/<fw>/                    each team's screenshots
    reports/<fw>.md                each team's report
    reports/<fw>-findings.json     each team's structured findings
    compare/                       the tech lead's cross-framework montages
    BUGS.md                        the tech lead's triaged, de-duplicated bug list
```

Tools (run from the repo root):
`node .agents/skills/wick-charts-dogfood/scripts/shot.mjs` (screenshot + interactions, see its header).

## Ground rules

- **The library is read-only.** Do not edit anything under `packages/`, tracked files, the root
  `package.json`, `pnpm-workspace.yaml` or `pnpm-lock.yaml`. Write only in your own app folder,
  `sessions/{SESSION}/shots/<fw>/` and `sessions/{SESSION}/reports/<fw>*`.
- **Do not rebuild the library.** The tech lead built `packages/*/dist` once for this session;
  parallel rebuilds clobber each other.
- **Be a user, not a maintainer.** Learn the API from what a user gets: `README.md`, the docs site
  source (`docs/pages/**`, especially `docs/pages/api/*`), https://wick-charts.eeff.io/llms-full.txt,
  the package's `.d.ts` types, and `.agents/skills/wick-charts/`. Read library source only to find the
  root cause of a bug you already observed. Each time the docs were not enough, log a docs finding.
- **Do not clean the data.** Adapters map field names only. No sorting, deduping, dropping nulls,
  gap filling or unit conversion — unless a scenario asks for a "cleaned" variant next to the raw one.
- No fixes to the library. If you find the root cause, cite `file:line` in the finding.

## Install (monorepo link, framework versions a new user gets today)

Link the local package: `"@wick-charts/<fw>": "link:../../../packages/<fw>"`. Install with
`pnpm install --ignore-workspace` inside the app folder. Use the current majors (check
`npm view <pkg> version`). Add `resolve.dedupe` for the framework in `vite.config` — the linked package
has its own `node_modules` with the monorepo's copy, and a duplicate framework there is a link
artifact, not a user-facing bug. With Vite 8+, also set `server.forwardConsole: false` (the headless
capture never opens the HMR socket). Log every other install step and friction point.

Ports (`--strictPort`): React **5181**, Vue **5182**, Svelte **5183**. Vite binds `[::1]`; use
`http://localhost:<port>/`.

## App contract (so screenshots are comparable)

- **Shared adapters.** Each scenario's data transform (dataset JSON -> series data, titles, options)
  lives once in `test/dogfood/shared/scenarios/<id>.ts`, framework-free TypeScript that every app
  imports. Apps only map that config onto components. In the first session each team wrote its own
  adapters, and most cross-framework pixel diffs came from them (totals kept as pie slices, three hour
  formats, different sums), not from the wrappers. The first team to reach a scenario writes its shared
  file; the others reuse it and report disagreements instead of forking it.
  The shared file also owns the **viewport** (explicit full range or the default window): in two
  sessions every default-render diff above 1% was one app passing `fullRange()` and another not.
- Import `../tools/frame.css` in the entry file.
- `/?s=<scenarioId>` renders ONLY that scenario inside `<div id="scenario">`, 960×480 px unless the
  scenario says otherwise (`class="auto-height"` for grids).
- `/` renders an index of all scenarios (links + all of them stacked).
- Default theme unless the scenario is about themes. Exact titles and subtitles from the table below
  (put both in the shared scenario file).
- Default viewport (no `initialRange` / `visibleRange`) unless the scenario names an exact range.
  Extra views (zoomed to the gap, StrictMode off, ...) go behind URL params such as `&view=gap` —
  the plain `?s=<id>` URL must be identical across frameworks, or the pixel compare is meaningless.
- No `Date.now()` / randomness in what you render, except in streaming scenarios.
- Set `window.__dogfood = { ready: true }` once the scenario has mounted and received data.
- Keep scenarios from earlier sessions working — they are the visual regression baseline.

## Screenshots

```
node .agents/skills/wick-charts-dogfood/scripts/shot.mjs --url 'http://localhost:5181/?s=candles-gap' \
  --out test/dogfood/sessions/{SESSION}/shots/react/candles-gap.png --selector '#scenario' --wait 2000
```
Interactions: `--actions '[{"type":"hover","selector":"#scenario canvas","fx":0.5,"fy":0.5}]'`
(also wheel / drag / resize / eval / mid-sequence shot). The tool prints console messages and page
errors — they are findings too. Use `--dpr 2` for sub-pixel glitches. **Read every PNG you produce.**
Name interaction states `<scenarioId>--hover.png`, `--zoom.png`, `--narrow.png`, ...

## Scenarios

Datasets: read `test/dogfood/data/CATALOG.md` first — the measured quirks are listed there.

| id | data | what to build | what to look for |
|---|---|---|---|
| `example-id` | dataset-id | components, exact title | the quirk this scenario exists for |

### Fix re-check

Bug issues closed since the last session (`coverage.mjs due --online`), each with the scenario it
came from. Every team fills the table for its framework.

| issue | scenario | check |
|---|---|---|
| #123 | scenario-id | what the fixed behaviour looks like |

Framework-specific probes: _<from `references/team-brief.md`, per framework>_

Packaging check (each team, its own package): `npm pack --dry-run` in `packages/<fw>` (read-only),
type-check the app with the framework's checker in strict mode; note every forced cast or `any`.

## Reports

`reports/<fw>.md`:
1. **Install & DX log** — steps with time spent; friction; what the docs got wrong or left out;
   "time to first chart".
2. **Scenario table** — id | status (`OK` / `BUG` / `MISSING` / `WORKAROUND` / `NOT DONE`) | screenshot | one-line note.
   A scenario with any finding attached is `BUG` (or `WORKAROUND` if you routed around it), never `OK` —
   the tech lead compares these statuses across frameworks.
   **Fix re-check table** — issue | scenario | fixed / NOT fixed / n/a | evidence. A NOT fixed row needs
   the same evidence as a BUG.
3. **Findings** — ranked, linked to `reports/<fw>-findings.json`.
4. **Missing features / API gaps** hit as a user — these become issues or ideas for the next session.
5. **New test ideas** — data or probes you would try next time, and why.
6. **Verdict** — would you ship a production dashboard on this today, in this framework?

`reports/<fw>-findings.json` — an array of:
```json
{
  "id": "R-01",
  "title": "short claim",
  "severity": "P0|P1|P2|P3",
  "area": "core|wrapper|types|docs|packaging",
  "scenario": "candles-gap",
  "dataset": "btc-1h-gap",
  "expected": "...",
  "actual": "...",
  "repro": "minimal code snippet or steps",
  "evidence": ["shots/react/candles-gap--hover.png"],
  "rootCause": "packages/core/src/...:123 — optional, only if verified",
  "frameworkSpecific": true,
  "confidence": "verified|likely"
}
```
Severity: **P0** crash, blank chart, or wrong numbers shown. **P1** misleading render (wrong axis, wrong
scale, lost data) or broken interaction. **P2** visual glitch, data still correct. **P3** DX / docs /
typing papercut. Only report what you observed. The tech lead re-checks every P0/P1; false positives
count against the team.
