# Agent success

The product metric: **how often a coding agent builds the chart a user asked for on the first try.**
Agents pick the library that works for them on the first try, so this number is also distribution.

Each case is a real prompt ("a live BTC chart with volume and history load") that goes to a fresh
Claude Code agent in a fresh Vite app, with the `wick-charts` skill installed the way
`npx skills add` installs it. The agent gets one prompt and no follow-up. Each failure points at one
of three fixes: an API change, an error message, or a skill change.

## Run

```bash
node evals/agent-success/run.mjs                    # all 30 cases, 1 run each, the npm release
node evals/agent-success/run.mjs --source local     # build + pack the working-tree packages instead
node evals/agent-success/run.mjs --case 'live-btc-*' --runs 3
node evals/agent-success/run.mjs --framework svelte
node evals/agent-success/run.mjs --no-skill         # baseline: the same prompts without the skill
node evals/agent-success/run.mjs --list             # print the cases
node evals/agent-success/report.mjs [results/<run>] # rebuild a REPORT.md
```

| option | default | |
|---|---|---|
| `--source npm\|local` | `npm` | `npm`: the latest release. `local`: `pnpm build` + `pnpm pack` of `packages/{react,vue,svelte}` |
| `--runs n` | 1 | runs per case; the report shows `k/n` and marks a case `flaky` |
| `-j n` | 3 | agents at the same time; they share one rate limit |
| `--model` | CLI default | the agent model |
| `--judge-model` | `sonnet` | the model that grades the criteria |
| `--max-turns`, `--timeout-min` | 80, 20 | limits per agent run |
| `--keep` | off | keep the workspaces in `$TMPDIR/wick-agent-evals/` |
| `--history` | on for a full run | append the score to `history.jsonl` |

A full run takes about 40 minutes at `-j 4`. The cost of each run is in its report.

## What a run is

1. **Workspace.** A copy of `templates/<framework>` outside the repo, with `node_modules` cloned from
   `.cache/` (installed once per package version), the skill in `.claude/skills/wick-charts/`, and a
   git commit, so the diff shows what the agent changed.
2. **Agent.** `claude -p <prompt>` with only project settings: your own CLAUDE.md, hooks, plugins,
   MCP servers and memory do not reach it. It can read, write, run shell commands and fetch web pages.
   It cannot ask questions.
3. **Checks.** Typecheck (`tsc`, `vue-tsc`, `svelte-check`), `vite build`, then `vite preview` in
   headless Chrome: no page error, no `console.error`, no `[wick-charts]` warning, and at least one
   canvas with a drawn chart.
4. **Judge.** An LLM reads the changed files, the screenshot and the agent's failed tool calls. It
   grades the case's `criteria` and lists findings, each with a kind and a suggested change.

**First-try success** = all checks pass and the judge passes every criterion. A run where the agent
hit an error and fixed it itself still passes; that friction shows up as a finding.

## Read the report

`results/<run>/REPORT.md` (git-ignored) has:

- the scenario × framework table: a scenario that passes in React and fails in Vue points at the
  Vue wrapper or the Vue part of the skill;
- **findings** grouped by kind — `api`, `error-message`, `skill`, `docs`, `harness`, `agent`.
  `blocking` findings made the run fail;
- the failed runs with the typecheck / build output and the failed criteria;
- agent behaviour: how often it loaded the skill, which skill files it read, how often it read the
  `.d.ts` or the compiled library source. A read of `dist/*.js` means the skill and the types did not
  answer a question.

Each run folder keeps `agent.jsonl` (the full transcript), `changes.patch`, `screenshot.png`,
`grade.json` and `judge.jsonl`.

## The loop

1. Run the suite. `history.jsonl` gets the score.
2. For each blocking finding that is not `agent` or `harness`: change the API, the error message or
   the skill. File an issue when the change is not small.
3. Re-run the failed cases on the change: `--source local --case <id> --runs 3`.
4. Release, then run the full suite on npm again.

Fix the library, not the prompt. Change a prompt only when it is not what a real user would type.

## Add a case

Add it to `cases.mjs`. A prompt is what a user types, not a spec: no component names, no hints.
`criteria` are what a reviewer checks beyond "it builds and draws": the data shape, the traps
(light theme on a light page, epoch ms, `minHeight` on small charts), cleanup on unmount. A case in
`parity` runs in React, Vue and Svelte. Set `network: true` when the chart needs live data; the
render step then waits longer.

Keep the set near 30 cases, so a full run stays cheap enough to run before each release.
