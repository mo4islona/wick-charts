// `@wick-charts/core` is private, so the package ships the built core in
// `dist/core`. svelte-package also copies the tests over; they are not shipped.
import { cpSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const coreDist = dirname(fileURLToPath(import.meta.resolve('@wick-charts/core')));

rmSync(resolve(root, 'dist/__tests__'), { recursive: true, force: true });

cpSync(coreDist, resolve(root, 'dist/core'), {
  recursive: true,
  filter: (src) => !src.endsWith('.cjs'),
});
