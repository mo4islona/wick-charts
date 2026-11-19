import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Painter types name two canvas interfaces. Declared empty here, they resolve in a Node project with no `dom` lib;
 * with the `dom` lib they merge into the full interfaces.
 */
const CANVAS_GLOBALS = `declare global {
  interface CanvasRenderingContext2D {}
  interface CanvasGradient {}
}

`;

/** The rolled-up declarations use no ESM-only syntax, so a copy types the `require` entry (TS1479). */
async function finishTypes(): Promise<void> {
  const types = resolve(__dirname, 'dist/index.d.ts');
  await writeFile(types, CANVAS_GLOBALS + (await readFile(types, 'utf8')));
  await copyFile(types, resolve(__dirname, 'dist/index.d.cts'));
}

const NODE_BUILTINS = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)];

export default defineConfig({
  plugins: [
    dts({
      rollupTypes: true,
      bundledPackages: ['@wick-charts/core'],
      exclude: ['**/__tests__/**', '**/*.test.ts', 'src/cli.ts'],
      afterBuild: finishTypes,
    }),
  ],
  build: {
    target: 'node20',
    ssr: true,
    emptyOutDir: true,
    lib: {
      entry: { index: resolve(__dirname, 'src/index.ts'), cli: resolve(__dirname, 'src/cli.ts') },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      // The core is bundled in; the canvas binding and the font files resolve at run time.
      external: [...NODE_BUILTINS, '@napi-rs/canvas', /^@fontsource\//],
      output: {
        banner: (chunk) => (chunk.name === 'cli' ? '#!/usr/bin/env node' : ''),
      },
    },
  },
});
