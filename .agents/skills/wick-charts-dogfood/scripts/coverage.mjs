#!/usr/bin/env node
// Dogfood coverage map helper. Run from the repo root.
//
//   node .agents/skills/wick-charts-dogfood/scripts/coverage.mjs due [--online]
//   node .agents/skills/wick-charts-dogfood/scripts/coverage.mjs check
//   node .agents/skills/wick-charts-dogfood/scripts/coverage.mjs show <probe-or-idea-id>
//
// `due` answers "what should the next session test, and how?". The map records what ran, on which
// data and in which format; bugs live only in GitHub issues (labels `bug`, P0-P3, `confirmed`), so
// `--online` reads them through `gh`
// (and npm for framework majors).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const COVERAGE_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'coverage.json');
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const IDEA_KINDS = ['dataset', 'angle'];
const FRAMEWORK_PACKAGES = { react: 'react', vue: 'vue', svelte: 'svelte' };

const coverage = JSON.parse(readFileSync(COVERAGE_PATH, 'utf8'));
const [command = 'due', ...rest] = process.argv.slice(2);
const online = rest.includes('--online');

switch (command) {
  case 'due':
    due();
    break;
  case 'check':
    check();
    break;
  case 'show':
    show(rest[0]);
    break;
  default:
    console.error(`unknown command ${command}; use due | check | show <id>`);
    process.exit(2);
}

function due() {
  const sessionsById = new Map(coverage.sessions.map((s) => [s.id, s]));
  const lastSession = coverage.sessions.at(-1);
  const staleDays = coverage.settings?.staleDays ?? 90;
  const today = new Date();
  const out = [];
  let urgent = 0;

  if (online && lastSession) {
    const closed = issues(['--label', 'bug', '--state', 'closed', '--search', `closed:>=${lastSession.id}`]);
    const open = issues(['--label', 'confirmed', '--state', 'open']);
    urgent += closed.length;
    out.push(section(`1. Bugs closed since ${lastSession.id} — re-check the fix on the same data`, closed));
    out.push(section('2. Open confirmed bugs — still reproducible?', open));
  } else {
    out.push(section('1-2. GitHub issues', [], 'Run with --online to list bugs closed since the last session.'));
  }

  const changed = [];
  for (const probe of coverage.probes) {
    const lastRun = probe.runs.at(-1);
    if (!lastRun || probe.paths.length === 0) continue;

    const commit = sessionsById.get(lastRun)?.commit;
    const count = commit ? commitsTouching(commit, probe.paths) : null;
    if (count) changed.push(`${probe.id} — ${count} commit(s) touched ${probe.paths.join(', ')} since ${commit}`);
  }
  urgent += changed.length;
  out.push(section('3. Code changed under a probe since it last ran (regression risk)', changed));

  const features = lastSession?.commit ? featureCommits(lastSession.commit) : [];
  const covered = new Set(coverage.probes.flatMap((p) => p.features ?? []));
  const uncovered = features.filter((f) => !covered.has(f.sha));
  urgent += uncovered.length;
  out.push(
    section(
      '4. New features since the last session — no probe yet',
      uncovered.map((f) => `${f.sha} ${f.subject}`),
      'Add a probe (or list the sha in an existing probe\'s "features") so it stops showing here.',
    ),
  );

  const stale = coverage.probes.filter((p) => {
    const lastRun = p.runs.at(-1);

    return lastRun ? daysBetween(sessionDate(lastRun), today) > staleDays : false;
  });
  out.push(
    section(
      `5. Stale — not run for more than ${staleDays} days`,
      stale.map((p) => `${p.id} — last ${p.runs.at(-1)}`),
    ),
  );

  const neverRun = coverage.probes.filter((p) => p.runs.length === 0).map((p) => `${p.id} — ${p.title}`);
  out.push(section('6. Probes that never ran', neverRun));

  for (const kind of IDEA_KINDS) {
    const ideas = coverage.ideas
      .filter((i) => i.kind === kind)
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
      .map((i) => `[${i.priority}] ${i.id} — ${i.idea}`);
    const title = kind === 'dataset' ? '7. Untested data (new datasets)' : '8. Untested angles (new ways to test)';
    out.push(section(title, ideas));
  }

  out.push(section('9. Quirk classes with no dataset or no recent run', quirkCoverage(today, staleDays)));

  if (online) {
    const bumps = frameworkBumps(lastSession);
    urgent += bumps.length * 10;
    out.push(section('10. Framework majors since the last session', bumps));
  }

  out.push(section('Recommendation', [recommend({ urgent, changed, uncovered })]));
  console.log(out.join('\n\n'));
}

function recommend({ urgent, changed, uncovered }) {
  if (urgent >= 10) {
    return `full or focused session: ${changed.length} regression risks, ${uncovered.length} unprobed features, plus re-checks.`;
  }

  if (urgent > 0) {
    return `focused session on sections 1, 3 and 4 (${urgent} items), plus one high-priority angle or dataset.`;
  }

  return 'sweep (compare against the last baseline, default and zoom states), then pick a high-priority angle or dataset.';
}

function quirkCoverage(today, staleDays) {
  const lines = [];

  for (const [quirk, meaning] of Object.entries(coverage.quirkClasses)) {
    const datasets = coverage.datasets.filter((d) => d.quirks.includes(quirk)).length;
    const recent = coverage.probes.filter((p) => {
      const lastRun = p.runs.at(-1);
      if (!lastRun || !p.quirks.includes(quirk)) return false;

      return daysBetween(sessionDate(lastRun), today) <= staleDays;
    }).length;

    if (datasets === 0 || recent === 0) {
      lines.push(`${quirk} (${meaning}) — ${datasets} dataset(s), ${recent} recent probe(s)`);
    }
  }

  return lines;
}

function check() {
  const errors = [];
  const sessionIds = new Set(coverage.sessions.map((s) => s.id));
  const datasetIds = new Set(coverage.datasets.map((d) => d.id));
  const quirks = new Set(Object.keys(coverage.quirkClasses));

  for (const kind of ['sessions', 'datasets', 'probes', 'ideas']) {
    const seen = new Set();

    for (const item of coverage[kind]) {
      if (seen.has(item.id)) errors.push(`${kind}: duplicate id ${item.id}`);
      seen.add(item.id);
    }
  }

  for (const d of coverage.datasets) {
    for (const q of d.quirks) {
      if (!quirks.has(q)) errors.push(`dataset ${d.id}: unknown quirk ${q}`);
    }

    for (const s of d.usedIn) {
      if (!sessionIds.has(s)) errors.push(`dataset ${d.id}: unknown session ${s}`);
    }
  }

  for (const p of coverage.probes) {
    for (const d of p.datasets) {
      if (d !== 'synthetic' && !datasetIds.has(d)) errors.push(`probe ${p.id}: unknown dataset ${d}`);
    }

    for (const q of p.quirks) {
      if (!quirks.has(q)) errors.push(`probe ${p.id}: unknown quirk ${q}`);
    }

    for (const s of p.runs) {
      if (!sessionIds.has(s)) errors.push(`probe ${p.id}: unknown session ${s}`);
    }
  }

  for (const i of coverage.ideas) {
    if (!(i.priority in PRIORITY_ORDER)) errors.push(`idea ${i.id}: bad priority ${i.priority}`);
    if (!IDEA_KINDS.includes(i.kind)) errors.push(`idea ${i.id}: kind must be ${IDEA_KINDS.join(' or ')}`);

    for (const q of i.quirks) {
      if (!quirks.has(q)) errors.push(`idea ${i.id}: unknown quirk ${q}`);
    }
  }

  if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exit(1);
  }

  const summary = `coverage ok: ${coverage.sessions.length} sessions, ${coverage.datasets.length} datasets, ${coverage.probes.length} probes, ${coverage.ideas.length} ideas`;
  console.log(summary);
}

function show(id) {
  const item = coverage.probes.find((p) => p.id === id) ?? coverage.ideas.find((i) => i.id === id);
  if (!item) {
    console.error(`no probe or idea "${id}"`);
    process.exit(1);
  }

  console.log(JSON.stringify(item, null, 2));
}

function issues(filters) {
  const json = run('gh', ['issue', 'list', ...filters, '--limit', '100', '--json', 'number,title']);
  if (!json) return ['(gh unavailable)'];

  return JSON.parse(json).map((i) => `#${i.number} ${i.title}`);
}

function commitsTouching(commit, paths) {
  const count = run('git', ['rev-list', '--count', `${commit}..HEAD`, '--', ...paths]);

  return count ? Number(count) : null;
}

function featureCommits(commit) {
  const log = run('git', ['log', '--format=%h%x09%s', `${commit}..HEAD`]);
  if (!log) return [];

  return log
    .split('\n')
    .map((line) => {
      const [sha, subject] = line.split('\t');

      return { sha, subject };
    })
    .filter((c) => /^feat(\(|:|!)/.test(c.subject));
}

function frameworkBumps(lastSession) {
  const bumps = [];

  for (const [fw, pkg] of Object.entries(FRAMEWORK_PACKAGES)) {
    const latest = run('npm', ['view', pkg, 'version']);
    const tested = String(lastSession?.frameworks?.[fw] ?? '');
    const latestMajor = latest?.split('.')[0];
    const testedMajor = tested.match(/^\d+/)?.[0];

    if (latestMajor && latestMajor !== testedMajor) {
      bumps.push(
        `${fw}: latest ${latest}, last tested ${tested || 'never'} — run the full scenario set on the new major`,
      );
    }
  }

  return bumps;
}

function section(title, lines, note = null) {
  const body = lines.length > 0 ? lines.map((l) => `  - ${l}`).join('\n') : '  (none)';
  const tail = note ? `\n  ${note}` : '';

  return `## ${title}\n${body}${tail}`;
}

function sessionDate(id) {
  return new Date(id.slice(0, 10));
}

function daysBetween(a, b) {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}
