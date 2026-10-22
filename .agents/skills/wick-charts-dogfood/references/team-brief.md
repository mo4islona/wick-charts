# Team brief (prompt template)

Send one Agent call per framework, all in one message, `run_in_background: true`,
`subagent_type: general-purpose`. Fill `{REPO}` (absolute repo path), `{FW}`, `{Fw}`, `{PORT}`, `{ID}` (R / V / S), `{SESSION}`,
`{PROBES}` (the framework block below, trimmed to this session's probes), and `{SCOPE}`
(either "all scenarios in PLAN.md" or the explicit list for a focused session).

The brief is deliberately strict about evidence and scope: in the first session, every team that
had a precise contract produced comparable, verifiable output, and the costliest failure mode is an
agent "fixing" the library or cleaning the data, which hides exactly the bugs we look for.

---

You are the **{Fw} team lead** in a dogfooding session for Wick Charts, a canvas charting library
(repo root: {REPO}). Other teams do the same work in the other frameworks in
parallel. The tech lead will accept your work, re-check your P0/P1 claims, and compare your
screenshots pixel-by-pixel against the other frameworks.

## Start here
Read `test/dogfood/sessions/{SESSION}/PLAN.md` completely. It is the contract: ground rules, install
method, app contract, scenarios, screenshot tool, report format. Follow it exactly. The most important
rules:
- `packages/` and all tracked files are read-only. Do not rebuild the library. Write only in
  `test/dogfood/{FW}/`, `test/dogfood/sessions/{SESSION}/shots/{FW}/`, `.../reports/{FW}*`.
- Learn the API as a user does (README, `docs/pages/`, `.d.ts` types, `.agents/skills/wick-charts/`,
  https://wick-charts.eeff.io/llms-full.txt). Read library source only to root-cause a bug you already
  observed, and log each time the docs were not enough.
- Pass data as-is. Do not clean it.

## Your setup
- App: `test/dogfood/{FW}/` on port **{PORT}** (`--strictPort`). If the app already exists from an
  earlier session, extend it — keep old scenarios working, they are the regression baseline. First
  update the framework to the current major if the coverage map shows it moved, and log what broke.
- Link `@wick-charts/{FW}` with `link:../../../packages/{FW}`, install with
  `pnpm install --ignore-workspace`, keep `resolve.dedupe` for the framework in the vite config.
- Start the dev server detached, not as a Bash background task:
  `(cd test/dogfood/{FW} && nohup pnpm dev > dev.log 2>&1 &)`, then wait for the ready line in `dev.log`.
  A `run_in_background` server keeps your agent alive after your hand-back.
- Screenshots: `node .agents/skills/wick-charts-dogfood/scripts/shot.mjs ...` from the repo root.
  Read every PNG you produce.

## Scope
{SCOPE}

## Order of work
1. **Install & DX** — only when the app is new or the framework major moved: scaffold, time each step,
   paste the README Quick Start snippet for {Fw} as-is, note every docs/reality mismatch.
2. **Packaging & types** — `npm pack --dry-run` in `packages/{FW}` (read-only), strict type-check of the
   app; note forced casts.
3. **Scenarios** — breadth first (everything rendered and shot), then depth on the suspicious ones:
   hover the tooltip at the interesting points (gap edge, spike, null), zoom, pan, narrow width.
   Before blaming the library, log the first rows you pass in and check your adapter.
4. **{Fw}-specific probes**:
{PROBES}
5. **Reports** — `reports/{FW}.md` and `reports/{FW}-findings.json` exactly as PLAN.md specifies.
   IDs `{ID}-01`, `{ID}-02`, ...

Quality bar: every BUG has a screenshot or console output and a minimal repro. Do not inflate
severities. Separate core bugs (any framework) from {Fw}-wrapper bugs. Leave the dev server running and
put its start command at the top of your report.

## Final message
Under 400 words: scenario counts by status, top 5 findings (id, severity, one line), main DX friction,
verdict, dev server command.

---

## Framework probe blocks

**All frameworks**
- Hover every overlay tooltip (`Tooltip`, `HeatmapTooltip`, `PieTooltip`) on a chart whose data is set before mount, with
  no `<Title>` and no theme change: a Title fires the event that hid a Vue tooltip P1 for a whole session.
- SSR probes: run them in both color schemes; headless Chrome follows the OS, and a light OS hid a theme mismatch.

**React**
- StrictMode on (the create-vite default): double-mount effects, `initialRange`, EdgeLoader firing.
- An inline array literal as `data` on every render; parent re-renders at 60 Hz with unchanged data.
- SSR: `vite.ssrLoadModule` + `react-dom/server` `renderToString` of a `ChartContainer`, then hydrate.
- React-only components (`Sparkline`, `EdgeLoader`) are usable from the docs alone.
- In a Next.js App Router app: compose a chart (Title, Legend, Navigator) inside a Server Component
  page and compare it with the same tree in a `'use client'` file — server-created children reach the
  client as lazy types (the 2026-10-21-full P1).

**Vue**
- `ref` / `reactive` deep proxies of the 130k-candle array vs `shallowRef` / `markRaw` (first paint,
  FPS); does the docs warn?
- In-place `push` / index assignment on a reactive data array: does the chart update or re-seed?
- `v-if` toggling and `<KeepAlive>`.
- Prop parity with React (`ChartContainer` padding / grid / interactive / gradient) against the real types.
- SSR: `vite.ssrLoadModule` + `@vue/server-renderer` `renderToString`.
- Build the closest equivalent for React-only components and log the gap.

**Svelte**
- The package in a Svelte 5 app, dev and `vite build`. If it fails, find the exact cause and whether an
  npm user is affected; then cover the scenarios on Svelte 4 (`test/dogfood/svelte4/`, root
  `node_modules` has svelte 4 + vite-plugin-svelte 3) and record which version each shot came from.
- `$state` (deep proxy) vs `$state.raw` arrays as `data`; in-place `push` on a `$state` array.
- `{#if}` toggling, `{#key}` remounts, stores vs runes for streaming.
- Prop parity with React against the real types.
- SSR: `vite.ssrLoadModule` + `svelte/server` `render`.
- Build the closest equivalent for React-only components and log the gap.
