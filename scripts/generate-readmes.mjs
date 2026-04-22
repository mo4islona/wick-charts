#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const SRC = join(ROOT, 'README.tmpl.md');
const HEADER = '<!-- Generated from README.tmpl.md — edit the template, not this file. -->\n\n';
const MIGRATION_ABS = 'https://github.com/mo4islona/wick-charts/blob/main/MIGRATION.md';

const TARGETS = {
  root: join(ROOT, 'README.md'),
  react: join(ROOT, 'packages/react/README.md'),
  vue: join(ROOT, 'packages/vue/README.md'),
  svelte: join(ROOT, 'packages/svelte/README.md'),
};

const DETAILS_WRAP = {
  vue: ['\n<details>\n<summary>Vue</summary>\n\n', '\n\n</details>\n'],
  svelte: ['\n<details>\n<summary>Svelte</summary>\n\n', '\n\n</details>\n'],
};

function processFw(body, target) {
  return body.replace(/<!-- @fw:(react|vue|svelte) -->\n([\s\S]*?)\n<!-- @\/fw -->\n?/g, (_, fw, inner) => {
    if (target === 'root') {
      if (fw === 'react') return `${inner}\n`;

      const [pre, post] = DETAILS_WRAP[fw];

      return `${pre + inner + post}\n`;
    }

    return fw === target ? `${inner}\n` : '';
  });
}

function processOnly(body, target) {
  return body.replace(/<!-- @only:(react|vue|svelte) -->\n([\s\S]*?)\n<!-- @\/only -->\n?/g, (_, fw, inner) => {
    if (target === 'root') return `${inner}\n`;

    return fw === target ? `${inner}\n` : '';
  });
}

function processInstall(body, target) {
  return body.replace(/<!-- @install -->\n([\s\S]*?)\n<!-- @\/install -->/g, (_, inner) => {
    if (target === 'root') return inner;

    const keep = `@wick-charts/${target}`;
    const lines = inner.split('\n').filter((line) => {
      if (line.startsWith('```')) return true;
      if (line.trim() === '') return true;

      return line.includes(keep);
    });
    const cleaned = lines.map((line) => (line.includes(keep) ? line.replace(/\s*#.*$/, '') : line));

    return cleaned.join('\n');
  });
}

function rewriteMigration(body, target) {
  if (target === 'root') return body;

  return body.replaceAll('./MIGRATION.md', MIGRATION_ABS);
}

function collapseBlankLines(body) {
  return body.replace(/\n{3,}/g, '\n\n');
}

function generate(src, target) {
  let out = src;
  out = processFw(out, target);
  out = processOnly(out, target);
  out = processInstall(out, target);
  out = rewriteMigration(out, target);
  out = collapseBlankLines(out);

  const body = out.trimStart().trimEnd();
  // Place the "generated" note right after the H1 so npm's package page scrapes the real
  // tagline as the description, not the HTML comment.
  const withHeader = body.replace(/^(# [^\n]+\n\n)/, `$1${HEADER}`);

  return withHeader === body ? `${HEADER}${body}` : withHeader;
}

function main() {
  const src = readFileSync(SRC, 'utf8');

  for (const [target, file] of Object.entries(TARGETS)) {
    const content = generate(src, target);
    writeFileSync(file, content);
    console.log(`✓ ${relative(ROOT, file)}`);
  }
}

main();
