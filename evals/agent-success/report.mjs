#!/usr/bin/env node
// Writes REPORT.md for one eval run and appends its score to history.jsonl.
//
//   node evals/agent-success/report.mjs [results/<runId>] [--history]
//
// Without a path it reports the latest run.

import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EVAL, RESULTS } from './lib/paths.mjs';

const HISTORY = join(EVAL, 'history.jsonl');
const FRAMEWORKS = ['react', 'vue', 'svelte'];
const KIND_ORDER = ['api', 'error-message', 'skill', 'docs', 'harness', 'agent'];

const pct = (passed, total) => (total === 0 ? 0 : Math.round((passed / total) * 100));
const cell = (text) => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ');

function loadRecords(runDir) {
  const records = [];
  for (const caseId of readdirSync(runDir)) {
    const caseDir = join(runDir, caseId);
    if (!existsSync(caseDir) || caseId.includes('.')) continue;

    for (const n of readdirSync(caseDir)) {
      const file = join(caseDir, n, 'run.json');
      if (existsSync(file)) records.push(JSON.parse(readFileSync(file, 'utf8')));
    }
  }

  return records.sort((a, b) => a.case.localeCompare(b.case) || a.run - b.run);
}

function failedSteps(record) {
  const steps = ['typecheck', 'build', 'render'].filter((k) => !record.checks[k].ok);
  if (!record.judge.ok) steps.push('criteria');
  if (record.agent.timedOut) steps.unshift('timeout');

  return steps;
}

function summarize(records, meta) {
  const passed = records.filter((r) => r.success).length;
  const perFramework = {};
  for (const framework of FRAMEWORKS) {
    const own = records.filter((r) => r.framework === framework);
    if (own.length === 0) continue;

    perFramework[framework] = { passed: own.filter((r) => r.success).length, total: own.length };
  }

  const cost = records.reduce((sum, r) => sum + (r.agent.costUsd ?? 0) + (r.judge.costUsd ?? 0), 0);

  return {
    date: meta.date,
    runId: meta.runId,
    commit: meta.commit,
    source: meta.source,
    versions: meta.versions,
    withSkill: meta.withSkill,
    model: records.find((r) => r.agent.model)?.agent.model ?? meta.model,
    runs: meta.runs,
    total: records.length,
    passed,
    rate: pct(passed, records.length),
    perFramework,
    costUsd: Math.round(cost * 100) / 100,
  };
}

function scenarioTable(records) {
  const scenarios = [...new Set(records.map((r) => r.scenario))];
  const rows = scenarios.map((scenario) => {
    const cells = FRAMEWORKS.map((framework) => {
      const own = records.filter((r) => r.scenario === scenario && r.framework === framework);
      if (own.length === 0) return '';

      const passed = own.filter((r) => r.success).length;
      const steps = [...new Set(own.filter((r) => !r.success).flatMap(failedSteps))];
      const mark = passed === own.length ? 'pass' : passed === 0 ? 'FAIL' : 'flaky';

      return `${mark} ${passed}/${own.length}${steps.length > 0 ? ` (${steps.join(', ')})` : ''}`;
    });

    return `| ${scenario} | ${cells.join(' | ')} |`;
  });

  return ['| scenario | react | vue | svelte |', '|---|---|---|---|', ...rows].join('\n');
}

function findingsSection(records) {
  const findings = records.flatMap((r) =>
    (r.judge.findings ?? []).map((f) => ({ ...f, where: `${r.case}#${r.run}`, failedRun: !r.success })),
  );
  if (findings.length === 0) return '_No findings._';

  const parts = [];
  for (const kind of KIND_ORDER) {
    const own = findings.filter((f) => f.kind === kind).sort((a, b) => Number(b.blocking) - Number(a.blocking));
    if (own.length === 0) continue;

    parts.push(`### ${kind} (${own.length})`, '', '| | run | finding | suggestion |', '|---|---|---|---|');
    for (const f of own) {
      parts.push(`| ${f.blocking ? 'blocking' : ''} | ${f.where} | ${cell(f.summary)} | ${cell(f.suggestion)} |`);
    }
    parts.push('');
  }

  return parts.join('\n');
}

function failuresSection(records) {
  const failed = records.filter((r) => !r.success);
  if (failed.length === 0) return '_Every run passed._';

  return failed
    .map((r) => {
      const lines = [`### ${r.case}#${r.run} — ${failedSteps(r).join(', ')}`, ''];
      if (!r.checks.typecheck.ok) lines.push('Typecheck:', '```', r.checks.typecheck.output.slice(-1500), '```');
      if (!r.checks.build.ok) lines.push('Build:', '```', r.checks.build.output.slice(-1500), '```');
      if (!r.checks.render.ok) lines.push(`Render: ${r.checks.render.errors.map(cell).join('; ')}`, '');
      for (const c of r.judge.criteria ?? []) {
        if (!c.pass) lines.push(`- criterion failed: ${c.criterion} — ${c.evidence}`);
      }
      if (r.judge.error) lines.push(`- judge: ${r.judge.error}`);

      return lines.join('\n');
    })
    .join('\n\n');
}

function agentSection(records) {
  const n = records.length;
  const avg = (pick) => {
    const values = records.map(pick).filter((v) => typeof v === 'number');

    return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
  };
  const reads = new Map();
  for (const r of records) {
    for (const file of r.agent.skillReads) {
      reads.set(file, (reads.get(file) ?? 0) + 1);
    }
  }
  const readList = [...reads.entries()].sort((a, b) => b[1] - a[1]).map(([f, c]) => `${f} ${c}`);

  return [
    `- skill invoked: ${records.filter((r) => r.agent.skillInvoked).length}/${n}`,
    `- skill files read (runs): ${readList.join(', ') || 'none'}`,
    `- runs that read the .d.ts: ${records.filter((r) => r.agent.typeReads > 0).length}/${n}`,
    `- runs that read the compiled library source: ${records.filter((r) => r.agent.sourceReads > 0).length}/${n}`,
    `- failed tool calls per run: ${avg((r) => r.agent.friction.length).toFixed(1)}`,
    `- turns per run: ${avg((r) => r.agent.turns).toFixed(1)}; minutes per run: ${(avg((r) => r.wallMs) / 60000).toFixed(1)}`,
    `- timeouts: ${records.filter((r) => r.agent.timedOut).length}`,
  ].join('\n');
}

/** @param {{ runDir: string, appendHistory: boolean }} options */
export function writeReport({ runDir, appendHistory }) {
  const meta = JSON.parse(readFileSync(join(runDir, 'meta.json'), 'utf8'));
  const records = loadRecords(runDir);
  const summary = summarize(records, meta);

  const frameworkLine = Object.entries(summary.perFramework)
    .map(([fw, s]) => `${fw} ${s.passed}/${s.total} (${pct(s.passed, s.total)}%)`)
    .join(' · ');

  const report = [
    `# Agent success — ${meta.runId}`,
    '',
    `**First-try success: ${summary.passed}/${summary.total} (${summary.rate}%)** — ${frameworkLine}`,
    '',
    `Packages: ${Object.values(meta.versions).join(', ')} (${meta.source}). Skill: ${meta.withSkill ? 'yes' : 'no'}.`,
    `Agent model: ${summary.model}. Judge: ${meta.judgeModel}. Commit: ${meta.commit}. Cost: $${summary.costUsd}.`,
    '',
    '## Scenarios',
    '',
    scenarioTable(records),
    '',
    '## Findings: what to change',
    '',
    'Each finding points at an API change, an error message, a skill or docs change. `agent` findings need no library change.',
    '',
    findingsSection(records),
    '## Failed runs',
    '',
    failuresSection(records),
    '',
    '## Agent behaviour',
    '',
    agentSection(records),
    '',
  ].join('\n');

  const reportFile = join(runDir, 'REPORT.md');
  writeFileSync(reportFile, report);
  if (appendHistory) appendFileSync(HISTORY, `${JSON.stringify(summary)}\n`);

  return { reportFile, summary };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const latest = readdirSync(RESULTS)
    .filter((d) => existsSync(join(RESULTS, d, 'meta.json')))
    .sort()
    .pop();
  const runDir = arg ? resolve(arg) : latest && join(RESULTS, latest);
  if (!runDir) {
    console.error('no run in results/');
    process.exit(1);
  }

  const { reportFile, summary } = writeReport({ runDir, appendHistory: process.argv.includes('--history') });
  console.log(`first-try success: ${summary.passed}/${summary.total} (${summary.rate}%)\n${reportFile}`);
}
