// Installs one template app per framework into the cache. A run clones it, so no run installs packages.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CACHE, REPO, TEMPLATES } from './paths.mjs';

const PACKAGES = { react: '@wick-charts/react', vue: '@wick-charts/vue', svelte: '@wick-charts/svelte' };
const PLACEHOLDER = { react: '__WICK_REACT__', vue: '__WICK_VUE__', svelte: '__WICK_SVELTE__' };

function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
}

/** Builds and packs the working-tree packages. Returns the tarball path per framework. */
function packLocal(frameworks) {
  const dir = join(CACHE, 'tarballs');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const tarballs = {};
  for (const framework of frameworks) {
    const pkg = join(REPO, 'packages', framework);
    console.log(`[prepare] build + pack ${PACKAGES[framework]}`);
    run('pnpm', ['run', 'build'], pkg);
    run('pnpm', ['pack', '--pack-destination', dir], pkg);

    const name = readdirSync(dir).find((f) => f.startsWith(`wick-charts-${framework}-`));
    if (!name) throw new Error(`pnpm pack wrote no tarball for ${framework}`);

    tarballs[framework] = join(dir, name);
  }

  return tarballs;
}

/**
 * @param {{ frameworks: string[], source: 'npm' | 'local' }} options
 * @returns {{ apps: Record<string, string>, versions: Record<string, string> }} cached app dir and package spec per framework
 */
export function prepare({ frameworks, source }) {
  const tarballs = source === 'local' ? packLocal(frameworks) : {};
  const apps = {};
  const versions = {};

  for (const framework of frameworks) {
    const spec =
      source === 'local' ? `file:${tarballs[framework]}` : run('npm', ['view', PACKAGES[framework], 'version'], REPO);
    const template = readFileSync(join(TEMPLATES, framework, 'package.json'), 'utf8');
    const manifest = template.replace(PLACEHOLDER[framework], spec);

    // A local tarball has the same path on each build, so its content goes into the key.
    const key = createHash('sha256').update(manifest);
    if (source === 'local') key.update(readFileSync(tarballs[framework]));

    const dir = join(CACHE, 'apps', `${framework}-${key.digest('hex').slice(0, 12)}`);
    if (!existsSync(join(dir, 'node_modules'))) {
      console.log(`[prepare] npm install ${framework} (${spec})`);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'package.json'), manifest);
      run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], dir);
    }

    apps[framework] = dir;
    versions[framework] = source === 'local' ? `local:${tarballs[framework].split('/').pop()}` : spec;
  }

  return { apps, versions };
}
