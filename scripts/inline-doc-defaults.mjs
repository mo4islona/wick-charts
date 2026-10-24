// Rewrites `{@link DEFAULT_*}` in a package's emitted `.d.ts` files to the
// constant's literal value. The doc comments name the constants so the source
// keeps one value, but the declaration bundles do not carry them, so a reader
// of the installed types would see a name with no number behind it.
//
// Usage: node scripts/inline-doc-defaults.mjs <dist dir>

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORE_SRC = join(root, 'packages/core/src');

/**
 * `DEFAULT_*` name → initializer text, from top-level `const` declarations in
 * the core source. A name two files define differently maps to null, so its
 * references stay as they are.
 */
function readInitializers() {
  const table = new Map();

  for (const file of sourceFiles(CORE_SRC)) {
    const source = readFileSync(file, 'utf8');

    for (const match of source.matchAll(/^(?:export )?const (DEFAULT_\w+)(?:: [\w ]+)? = ([^;\n]+);/gm)) {
      const [, name, init] = match;
      const known = table.get(name);
      const conflict = known !== undefined && known !== init.trim();

      table.set(name, conflict ? null : init.trim());
    }
  }

  return table;
}

function sourceFiles(dir) {
  const files = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue;

    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (entry.name.endsWith('.ts')) {
      files.push(path);
    }
  }

  return files;
}

function resolveValue(name, table, seen = new Set()) {
  const init = table.get(name);
  if (init === undefined || init === null || seen.has(name)) return null;

  if (/^-?\d+(\.\d+)?$/.test(init)) return init;
  if (/^'[^']*'$/.test(init)) return init;

  seen.add(name);

  return resolveValue(init, table, seen);
}

function declarationFiles(dir) {
  const files = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...declarationFiles(path));
    } else if (entry.name.endsWith('.d.ts')) {
      files.push(path);
    }
  }

  return files;
}

const dist = process.argv[2];
if (!dist) {
  console.error('usage: inline-doc-defaults.mjs <dist dir>');
  process.exit(1);
}

const table = readInitializers();
let replaced = 0;

for (const file of declarationFiles(resolve(dist))) {
  const before = readFileSync(file, 'utf8');
  const after = before.replace(/\{@link (DEFAULT_\w+)\}/g, (full, name) => {
    const value = resolveValue(name, table);
    if (value === null) return full;

    replaced++;

    return value;
  });

  if (after !== before) writeFileSync(file, after);
}

console.log(`inline-doc-defaults: ${replaced} references in ${dist}`);
