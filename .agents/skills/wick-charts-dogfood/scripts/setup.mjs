#!/usr/bin/env node
// Prepare the git-ignored dogfood workspace for a session. Run from the repo root.
//
//   node .agents/skills/wick-charts-dogfood/scripts/setup.mjs <sessionId>
//
// Creates test/dogfood/sessions/<id>/{reports,shots,compare}, copies the shared frame.css
// to test/dogfood/tools/ (the path the apps import), seeds PLAN.md from the template, and
// reports which datasets are missing and which app ports are already serving.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORK = 'test/dogfood';
const id = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const session = join(WORK, 'sessions', id);

for (const dir of ['reports', 'shots', 'compare']) {
  mkdirSync(join(session, dir), { recursive: true });
}
mkdirSync(join(WORK, 'tools'), { recursive: true });
mkdirSync(join(WORK, 'data'), { recursive: true });

copyFileSync(join(SKILL, 'assets/frame.css'), join(WORK, 'tools/frame.css'));

const plan = join(session, 'PLAN.md');
if (!existsSync(plan)) {
  const template = readFileSync(join(SKILL, 'references/plan-template.md'), 'utf8');
  writeFileSync(plan, template.replaceAll('{SESSION}', id));
}

const coverage = JSON.parse(readFileSync(join(SKILL, 'coverage.json'), 'utf8'));
const missing = coverage.datasets.filter((d) => !existsSync(join(WORK, 'data', `${d.id}.json`)));
const ports = await Promise.all(
  Object.entries(coverage.settings.ports).map(async ([fw, port]) => {
    const up = await fetch(`http://localhost:${port}/`).then(
      () => true,
      () => false,
    );

    return `${fw}:${port} ${up ? 'serving' : 'down'}`;
  }),
);
const apps = Object.keys(coverage.settings.ports).map(
  (fw) => `${fw} ${existsSync(join(WORK, fw, 'package.json')) ? 'exists' : 'missing'}`,
);

console.log(`session dir: ${session}`);
console.log(`PLAN.md:     ${plan}`);
console.log(`apps:        ${apps.join(', ')}`);
console.log(`ports:       ${ports.join(', ')}`);
console.log(
  missing.length > 0
    ? `missing datasets (${missing.length}): ${missing.map((d) => `${d.id} [${d.fetch}]`).join(', ')}`
    : 'datasets:    all present',
);
