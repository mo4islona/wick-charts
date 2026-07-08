// Builds a single self-contained UMD bundle of @wick-charts/core (global
// `WickCharts`) so the library can be dropped into any sandbox — CodePen,
// JSFiddle, a plain <script> tag — with one URL and no bundler.
//
// The file is emitted into @wick-charts/react's dist, NOT core's: core stays
// `private: true` and never hits npm, but react IS published, and unpkg /
// jsDelivr serve any path inside a published tarball. So the bundle rides
// along and is reachable at, e.g.:
//   https://unpkg.com/@wick-charts/react/dist/wick-charts.umd.min.js
//   https://cdn.jsdelivr.net/npm/@wick-charts/react/dist/wick-charts.umd.min.js
//
// core has zero runtime dependencies, so the UMD is fully standalone — nothing
// to externalise, no peer globals to wire up in the sandbox.
//
// Run as react's post-build step (see packages/react package.json) so react's
// own `vite build` has already emptied and repopulated dist before this writes
// into it. Paths resolve from this file, not the cwd, so it is invocation-safe.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const entry = resolve(repoRoot, 'packages/core/src/index.ts');
const outDir = resolve(repoRoot, 'packages/react/dist');
const fileName = 'wick-charts.umd.min.js';

await build({
  configFile: false,
  root: repoRoot,
  logLevel: 'warn',
  build: {
    // Match the per-package configs: keep native #private fields instead of
    // letting the default target lower them to WeakMap helpers.
    target: 'es2022',
    minify: 'esbuild',
    // react's vite build owns this directory; only add our file to it.
    emptyOutDir: false,
    lib: {
      entry,
      name: 'WickCharts',
      formats: ['umd'],
      fileName: () => fileName,
    },
    outDir,
  },
});

console.log(`[build-umd] wrote ${resolve(outDir, fileName)}`);
