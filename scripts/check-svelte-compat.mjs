#!/usr/bin/env node
// Compiles every shipped `.svelte` file with Svelte 4 and 5, client and server.
// Syntax that either major rejects breaks every app on it. Run after `pnpm build`.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as svelte4 from 'svelte/compiler';
import * as svelte5 from 'svelte5/compiler';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'packages/svelte/dist');

const COMPILERS = [
  { compiler: svelte4, targets: ['dom', 'ssr'] },
  { compiler: svelte5, targets: ['client', 'server'] },
];

const files = readdirSync(DIST, { recursive: true })
  .filter((name) => name.endsWith('.svelte'))
  .map((name) => resolve(DIST, name));

if (files.length === 0) {
  console.error(`No .svelte files in ${relative(ROOT, DIST)} — run \`pnpm build\` first.`);
  process.exit(1);
}

const problems = [];

for (const { compiler, targets } of COMPILERS) {
  for (const file of files) {
    const source = readFileSync(file, 'utf8');

    for (const generate of targets) {
      const label = `svelte@${compiler.VERSION} ${generate} ${relative(ROOT, file)}`;

      try {
        const { warnings } = compiler.compile(source, { filename: file, generate });

        for (const warning of warnings) {
          problems.push(`${label}: ${warning.code} — ${warning.message}`);
        }
      } catch (err) {
        problems.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n\n'));
  process.exit(1);
}

const versions = COMPILERS.map(({ compiler }) => compiler.VERSION).join(' and ');
console.log(`✓ ${files.length} components compile cleanly with Svelte ${versions}.`);
