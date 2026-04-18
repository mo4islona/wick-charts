#!/usr/bin/env node
// Bundle-size check for @wick-charts/react consumer scenarios.
//
// Builds each scenario as a synthetic ESM entrypoint through esbuild with
// production-like settings (minify, tree-shake, browser target) and reports
// raw + gzipped sizes. React/ReactDOM are treated as external peers so the
// numbers reflect only the library's footprint.
//
// Requires the React package dist to exist — run `pnpm build` first, or pass
// `--build` to have this script run it for you.

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { build } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = resolve(ROOT, 'packages/react/dist/index.js');
// Synthetic entrypoints must live inside the workspace so esbuild can resolve
// `@wick-charts/react` via node_modules traversal.
const TMP = resolve(ROOT, 'node_modules/.cache/bundle-size');

/** Entry source per scenario. Each imports from '@wick-charts/react' exactly
 *  as a consumer would. Pinning each symbol through a `globalThis` assignment
 *  keeps esbuild from treating the imports as side-effect-free and dropping
 *  them — plain `void [...]` gets folded away under `minify + sideEffects: false`. */
const SCENARIOS = [
  {
    name: 'candlestick-only',
    source: `
import { ChartContainer, CandlestickSeries, Crosshair, TimeAxis, YAxis, darkTheme } from '@wick-charts/react';
globalThis.__wickSizeProbe = { ChartContainer, CandlestickSeries, Crosshair, TimeAxis, YAxis, darkTheme };
`,
  },
  {
    name: 'line-only',
    source: `
import { ChartContainer, LineSeries, Crosshair, TimeAxis, YAxis, darkTheme } from '@wick-charts/react';
globalThis.__wickSizeProbe = { ChartContainer, LineSeries, Crosshair, TimeAxis, YAxis, darkTheme };
`,
  },
  {
    name: 'react-full',
    source: `
import * as WickCharts from '@wick-charts/react';
globalThis.__wickSizeProbe = WickCharts;
`,
  },
];

function ensureBuilt() {
  if (existsSync(DIST)) return;
  if (!process.argv.includes('--build')) {
    console.error(`error: ${DIST} not found. Run \`pnpm build\` first, or re-run with \`--build\`.`);
    process.exit(1);
  }
  console.log('Building @wick-charts/react...');
  execSync('pnpm --filter @wick-charts/react build', { cwd: ROOT, stdio: 'inherit' });
}

async function measure(scenario) {
  const entry = resolve(TMP, `${scenario.name}.mjs`);
  writeFileSync(entry, scenario.source);

  const result = await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    mainFields: ['module', 'main'],
    // `@wick-charts/react` isn't a dep of the workspace root, so alias the
    // bare specifier directly at its built ESM entry. This also guarantees we
    // measure what actually ships (dist), not the pnpm-symlinked source.
    alias: { '@wick-charts/react': DIST },
    external: ['react', 'react-dom', 'react/jsx-runtime'],
    write: false,
    absWorkingDir: ROOT,
    logLevel: 'error',
  });

  const output = result.outputFiles[0].contents;
  const raw = output.byteLength;
  const gzip = gzipSync(output, { level: 9 }).byteLength;
  return { raw, gzip };
}

function fmt(bytes) {
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${bytes} B`;
}

function padRight(s, w) {
  return s + ' '.repeat(Math.max(0, w - s.length));
}

function padLeft(s, w) {
  return ' '.repeat(Math.max(0, w - s.length)) + s;
}

async function main() {
  ensureBuilt();
  mkdirSync(TMP, { recursive: true });

  const rows = [];
  for (const scenario of SCENARIOS) {
    const { raw, gzip } = await measure(scenario);
    rows.push({ name: scenario.name, raw, gzip });
  }

  const nameW = Math.max(8, ...rows.map((r) => r.name.length));
  const rawW = Math.max(7, ...rows.map((r) => fmt(r.raw).length));
  const gzipW = Math.max(8, ...rows.map((r) => fmt(r.gzip).length));

  const header = `${padRight('scenario', nameW)}  ${padLeft('raw', rawW)}  ${padLeft('gzip', gzipW)}`;
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const r of rows) {
    console.log(`${padRight(r.name, nameW)}  ${padLeft(fmt(r.raw), rawW)}  ${padLeft(fmt(r.gzip), gzipW)}`);
  }

  if (process.argv.includes('--json')) {
    console.log();
    console.log(JSON.stringify(rows, null, 2));
  }

  rmSync(TMP, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
