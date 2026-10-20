---
name: wick-charts-dogfood
description: Run a recurring dogfooding session for Wick Charts — build the same charts in React, Vue and Svelte on real, messy public data (gaps, nulls, DST, outliers, 1e-6 prices, 130k points), compare the frameworks screenshot by screenshot, and file what breaks as GitHub issues. A coverage map remembers what was already tested, how and on which data, so each session picks a new angle or a new dataset instead of repeating the last one. Use whenever the user asks to dogfood ("догфуд", "дофуд"), run a QA / smoke / real-data session across frameworks, re-check fixes before a release, asks "what should we test next" or "what did we already test", wants to add a dataset or a test idea for later, or wants to compare how the React, Vue and Svelte packages behave in practice.
metadata:
  internal: true
---

# Wick Charts dogfooding

Unit tests (see `wick-charts-testing`) check what the code draws. Dogfooding checks what a user gets:
the install, the docs, the three framework wrappers, and real data that nobody cleaned. A series of
sessions finds more than one session repeated, if each session knows what the earlier ones already
covered. That is the only memory this skill keeps: `coverage.json`, read by `coverage.mjs due`.

Bugs are not part of that memory. They go to GitHub issues labelled `bug`, a severity (`P0`-`P3`)
and `confirmed` once the tech lead reproduced them; `due --online` lists the bugs closed since the
last session so the next one re-checks each fix on the same data.

## Files

| path | what |
|---|---|
| `coverage.json` | what was tested and how: sessions (format, versions, lessons), datasets, quirk classes, probes (when each ran), ideas not yet tried |
| `scripts/coverage.mjs` | `due [--online]` — what to test next; `check` — validate the map; `show <id>` — one probe or idea |
| `scripts/setup.mjs <id>` | create the session folder, copy `frame.css`, seed `PLAN.md`, report missing data / apps / ports |
| `scripts/shot.mjs` | headless screenshot + interactions (hover, wheel, drag, resize, eval) + console capture |
| `scripts/compare.mjs` | per scenario: react / vue / svelte side by side, diff vs react, diff vs the last session; `--state zoom` or `--state hover` compares interaction states |
| `scripts/data/*.mjs` | dataset fetchers with pinned windows (re-fetch = same rows) |
| `references/plan-template.md` | the contract every team follows (rules, install, app contract, report format) |
| `references/team-brief.md` | the team agent prompt + per-framework probe blocks |
| `references/data-brief.md` | the data agent prompt + source notes |
| `references/acceptance.md` | the tech lead's half: compare, verify, BUGS.md, issues, coverage update |

Working area (git-ignored, persistent on this machine): `test/dogfood/` — `data/` snapshots, the apps
`react/ vue/ svelte/` (ports 5181 / 5182 / 5183), and `sessions/<id>/` with the plan, shots, team
reports, compare montages and BUGS.md (working notes; the issues are the record). The apps are kept
between sessions on purpose: their scenarios are the visual regression baseline. If `test/dogfood/`
is gone (new machine), the first session rebuilds the apps from the contract — a full session.

`shadcn/` (port 5184) is a `shadcn init -t vite -p nova` app with the `registry/shadcn` blocks
installed by the shadcn CLI. The root page shows every block under its registry name; `?s=<id>` shows
one (`sparks`, `line`, `candles`, `bars`, `donut`, `band`, `area`, `heatmap`, `annotations`, `navigator`,
`book`), `?theme=dark`, `?tokens=blue|emerald|orange|legacy` swaps in the `--chart-*` ramp of that shadcn
theme (default: the neutral grey ramp). To refresh the blocks: `pnpm registry:build`, serve `docs/public` on port 4319 with
the registry URLs rewritten to `http://localhost:4319/r/`, then `npx shadcn add -y -o <item URLs>`.

## Session types — pick the cheapest one that covers `due`

Agents are the expensive part (a framework team is ~0.5M tokens and about an hour).

| type | when | who |
|---|---|---|
| **sweep** | before every release; nothing urgent in `due` | you alone: build, start the apps, `compare.mjs --baseline <last>` plus `--state zoom`, re-check bugs closed since the last session |
| **focused** | `due` lists closed issues, regression risks or unprobed features; one new angle or dataset | a data agent only if new data is needed + 1-3 teams on ≤ 8 selected probes |
| **full** | a framework major moved, the apps do not exist, or quarterly | a data agent if needed + three teams on everything |

Vary the angle between sessions, not only the data: the first session was "three blank Vite apps,
one agent per framework, docs + repo access". Untried angles (a docs-only persona, an upgrade from an
old release, an existing app to embed into, mobile, SSR meta-frameworks) are listed under `ideas`.

## The loop

1. **Plan.** Run `node .agents/skills/wick-charts-dogfood/scripts/coverage.mjs due --online` (drop
   `--online` without network). Sections 1-4 are the must-dos: fixed issues to re-check, code that
   changed under a probe, features with no probe. Sections 7-8 offer the new data and new angles.
   Choose the session type, the probes and one new angle or dataset. Tell the user the plan and its
   cost before launching agents.
2. **Prepare.** `node .agents/skills/wick-charts-dogfood/scripts/setup.mjs <id>` (id = date, e.g.
   `2026-11-20`). Fill the scenario table and the session focus in `sessions/<id>/PLAN.md` — reuse
   scenario rows from the previous session's PLAN for re-checks. Build the library once:
   `pnpm build`. Note whether the working tree is dirty.
3. **Data.** Reuse the snapshots. Re-fetch missing files with `scripts/data/*.mjs`. New datasets only
   via a data agent with `references/data-brief.md`; register them in `coverage.json`.
4. **Teams.** Launch the framework agents in ONE message with `references/team-brief.md`. They start
   with install / DX / packaging, so they can start while a data agent still runs.
5. **Accept, triage, file, record** — `references/acceptance.md`. Do not skip the coverage update: it
   is what lets the next session test something new instead of repeating this one.

## Rules that keep the results trustworthy

- **The library is read-only during a session.** Teams that "fix" the code hide the bugs we are
  looking for, and there may be uncommitted work in `packages/`.
- **One build per session, by the tech lead.** Parallel `pnpm build` runs clobber `dist/`.
- **Data goes in raw.** Adapters only map field names. Real users pass gaps, nulls and descending
  arrays; the library must cope or fail loudly.
- **Docs first, source last.** Teams learn the API from README, docs pages, types, llms-full.txt and
  the `wick-charts` skill. Every trip into source to learn the API is a docs finding.
- **Current framework majors**, linked via `link:` + `resolve.dedupe` — what a new user gets today,
  without publishing anything.
- **Evidence or it did not happen.** Each BUG has a screenshot or console output and a repro; the tech
  lead re-checks every P0/P1 before it becomes an issue.
- **Issues are public.** The user approves the list before anything is filed.

## Environment traps (learned the hard way)

- The Bash sandbox blocks headless Chrome's own sockets. `shot.mjs` / `compare.mjs` proxy every
  request through Node, with retries — do not "simplify" that away. The Vite HMR websocket never
  connects; its console noise is filtered.
- Vite binds `[::1]`: use `http://localhost:<port>/`; a bare `curl localhost` may time out — use
  `curl 'http://[::1]:<port>/'`.
- Inside the repo, `pnpm install` would join the root workspace; apps use `--ignore-workspace`.
- `puppeteer` comes from the root `node_modules`; the browser is the system Google Chrome.
- Team agents must start dev servers detached (`nohup ... &`). A `run_in_background` server keeps the
  agent alive after its hand-back; stop such an agent with TaskStop.
- Vite 8 forwards browser console output over the HMR socket, which the proxied browser never opens:
  set `server.forwardConsole: false` or every capture logs "Failed to send error to Vite server".
- With three teams capturing at once, headless runs fail at random (`ERR_FAILED`, CDP `ETIMEDOUT`,
  load average ~10). Retry once before treating a failed capture as a finding.
- Apps load data at different speeds: `compare.mjs` waits for `window.__dogfood.ready` before the
  settle time, or a slow app is captured mid-intro and the diff shows animation phase.
- `vue-tsc` does not run on TypeScript 7 yet — pin TypeScript 6 in the Vue app. A second copy of Vue's
  types from the linked package needs `paths: { vue: ['./node_modules/vue'] }` (link artifact).
- When Svelte 5 is blocked, the Svelte 4 fallback app lives in `test/dogfood/svelte4/` and reuses the root
  `node_modules` (svelte 4 + vite-plugin-svelte 3 + Vite 5); it serves port 5183.

## Coverage map reference

- `sessions[]` — `id`, `type`, `commit`, `dirtyTree`, `libVersion`, `frameworks` (exact versions),
  `approach` (who ran what: agents, scenarios, compare states, probes), `notes` (process lessons).
- `datasets[]` — `id`, `source`, `fetch` (fetcher + id), `window` (`pinned` / `rolling`), `quirks`,
  `fetchedAt`, `usedIn` (session ids).
- `quirkClasses` — the vocabulary of data imperfections. Add a class when a new kind appears; `due`
  flags classes with no dataset or no recent run.
- `probes[]` — a scenario or a framework check: `datasets`, `quirks`, `frameworks`, `paths` (code it
  exercises — drives regression detection), `features` (shas it covers), `runs` (session ids). No
  result, no bug status: those live in the issues.
- `ideas[]` — not yet tried: `kind` (`dataset` = new data, `angle` = a new way to test), `idea`, `why`,
  `priority`, `quirks`. An idea leaves the list when it becomes a probe or a dataset.

`due` logic, so you can trust or override it: a `bug` issue closed since the last session needs a
re-check on the same data (`--online`); a probe whose `paths` got commits since it last ran is a
regression risk; a `feat:` commit since the last session that no probe lists in `features` needs a
probe; a probe not run for `settings.staleDays` (90) is stale; a framework major newer than the last
session's suggests a full session.
