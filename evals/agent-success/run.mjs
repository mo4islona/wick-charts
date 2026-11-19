#!/usr/bin/env node
// Agent-success eval: each prompt goes to a fresh coding agent once, and the run counts as a success only
// when the result typechecks, builds, draws the chart without errors and meets the prompt's criteria.
//
//   node evals/agent-success/run.mjs                      all cases, 1 run each, the npm release
//   node evals/agent-success/run.mjs --source local       the working-tree packages
//   node evals/agent-success/run.mjs --case 'live-btc-*' --framework vue --runs 3
//   node evals/agent-success/run.mjs --no-skill           baseline: the same prompts without the skill
//
// See README.md for the options and the triage loop.

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { cases as allCases } from './cases.mjs';
import { createWorkspace, runAgent } from './lib/agent.mjs';
import { grade } from './lib/grade.mjs';
import { REPO, RESULTS, WORKSPACES } from './lib/paths.mjs';
import { prepare } from './lib/prepare.mjs';
import { writeReport } from './report.mjs';

const { values: opts } = parseArgs({
  options: {
    case: { type: 'string', multiple: true },
    framework: { type: 'string', multiple: true },
    runs: { type: 'string', default: '1' },
    concurrency: { type: 'string', short: 'j', default: '3' },
    source: { type: 'string', default: 'npm' },
    model: { type: 'string' },
    'judge-model': { type: 'string', default: 'sonnet' },
    'max-turns': { type: 'string', default: '80' },
    'timeout-min': { type: 'string', default: '20' },
    'no-skill': { type: 'boolean', default: false },
    keep: { type: 'boolean', default: false },
    history: { type: 'boolean' },
    list: { type: 'boolean', default: false },
  },
});

const globToRegExp = (glob) => new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')}$`);

const selected = allCases.filter((c) => {
  const byCase = !opts.case || opts.case.some((g) => globToRegExp(g).test(c.id));
  const byFramework = !opts.framework || opts.framework.includes(c.framework);

  return byCase && byFramework;
});

if (opts.list || selected.length === 0) {
  for (const c of selected.length > 0 ? selected : allCases) {
    console.log(`${c.id.padEnd(28)} ${c.prompt.slice(0, 100)}`);
  }
  if (selected.length === 0) console.error('\nno case matches the filter');

  process.exit(selected.length === 0 ? 1 : 0);
}

if (opts.source !== 'npm' && opts.source !== 'local') {
  console.error('--source is npm or local');
  process.exit(2);
}

const runs = Number(opts.runs);
const withSkill = !opts['no-skill'];
const frameworks = [...new Set(selected.map((c) => c.framework))];
const { apps, versions } = prepare({ frameworks, source: opts.source });

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const runId = `${stamp}-${opts.source}${withSkill ? '' : '-noskill'}`;
const runDir = join(RESULTS, runId);
mkdirSync(runDir, { recursive: true });

const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain', '--', '.agents/skills/wick-charts', 'packages'], {
  cwd: REPO,
  encoding: 'utf8',
}).trim();
const filtered = Boolean(opts.case || opts.framework);
const meta = {
  runId,
  date: new Date().toISOString(),
  commit: dirty ? `${commit}+dirty` : commit,
  source: opts.source,
  versions,
  withSkill,
  model: opts.model ?? 'default',
  judgeModel: opts['judge-model'],
  runs,
  cases: selected.map((c) => c.id),
  filtered,
};
writeFileSync(join(runDir, 'meta.json'), JSON.stringify(meta, null, 2));

const tasks = selected.flatMap((testCase) => Array.from({ length: runs }, (_, i) => ({ testCase, n: i + 1 })));
console.log(`[run] ${runId}: ${tasks.length} agent runs, concurrency ${opts.concurrency}`);

let done = 0;

async function runTask({ testCase, n }) {
  const label = `${testCase.id}#${n}`;
  const cwd = join(WORKSPACES, runId, `${testCase.id}-${n}`);
  const out = join(runDir, testCase.id, String(n));
  mkdirSync(out, { recursive: true });

  createWorkspace({ dir: cwd, framework: testCase.framework, cachedApp: apps[testCase.framework], withSkill });

  const started = Date.now();
  const agent = await runAgent({
    cwd,
    prompt: testCase.prompt,
    model: opts.model,
    maxTurns: Number(opts['max-turns']),
    timeoutMs: Number(opts['timeout-min']) * 60_000,
    logFile: join(out, 'agent.jsonl'),
  });
  const gradeResult = await grade({ cwd, testCase, agent, judgeModel: opts['judge-model'] });

  execFileSync('git', ['add', '-A'], { cwd });
  const diff = execFileSync('git', ['diff', '--cached', '--', '.', ':(exclude).eval'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  writeFileSync(join(out, 'changes.patch'), diff);
  for (const file of readdirSync(join(cwd, '.eval'))) {
    cpSync(join(cwd, '.eval', file), join(out, file));
  }

  const record = {
    case: testCase.id,
    scenario: testCase.scenario,
    framework: testCase.framework,
    run: n,
    wallMs: Date.now() - started,
    agent,
    ...gradeResult,
  };
  writeFileSync(join(out, 'run.json'), JSON.stringify(record, null, 2));

  if (!opts.keep) rmSync(cwd, { recursive: true, force: true });

  done++;
  const mark = record.success ? 'PASS' : 'FAIL';
  const failed = ['typecheck', 'build', 'render'].filter((k) => !record.checks[k].ok);
  if (!record.judge.ok) failed.push('judge');
  console.log(`[${done}/${tasks.length}] ${mark} ${label} ${failed.length > 0 ? `(${failed.join(', ')})` : ''}`);

  return record;
}

async function pool(items, size, worker) {
  const queue = [...items];
  const results = [];

  async function next() {
    const item = queue.shift();
    if (!item) return;

    try {
      results.push(await worker(item));
    } catch (error) {
      console.error(`[run] ${item.testCase.id}#${item.n} crashed: ${error.stack ?? error}`);
    }

    await next();
  }

  await Promise.all(Array.from({ length: Math.min(size, items.length) }, next));

  return results;
}

await pool(tasks, Number(opts.concurrency), runTask);

const appendHistory = opts.history ?? !filtered;
const { reportFile, summary } = writeReport({ runDir, appendHistory });
console.log(`\n[run] first-try success: ${summary.passed}/${summary.total} (${summary.rate}%)`);
console.log(`[run] report: ${reportFile}`);
if (existsSync(join(WORKSPACES, runId)) && !opts.keep)
  rmSync(join(WORKSPACES, runId), { recursive: true, force: true });
