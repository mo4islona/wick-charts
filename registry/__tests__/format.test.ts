// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Installed files must pass the `prettier --check` of a project made with the shadcn templates.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SHIPPED_DIRS = [
  'registry/shadcn/blocks',
  'registry/shadcn/hooks',
  'registry/shadcn/ui',
  'registry/shadcn-vue/components',
  'registry/shadcn-vue/composables',
];

// The Svelte registry formats with its own Prettier, which has the Svelte 5 plugin.
const SVELTE_REGISTRY = resolve(ROOT, 'registry/shadcn-svelte');
const SVELTE_SHIPPED_DIRS = ['blocks', 'hooks', 'ui'];

function prettierCheck(args: { prettier: string; cwd: string; dirs: string[] }): string {
  try {
    execFileSync(args.prettier, ['--check', ...args.dirs], {
      cwd: args.cwd,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    return '';
  } catch (error) {
    const { stdout = '', stderr = '' } = error as { stdout?: string; stderr?: string };

    return `${stdout}${stderr}`;
  }
}

describe('registry sources', () => {
  it('are in the shadcn Prettier style (run `pnpm registry:format`)', () => {
    const prettier = resolve(ROOT, 'node_modules/.bin/prettier');

    expect(prettierCheck({ prettier, cwd: ROOT, dirs: SHIPPED_DIRS })).toBe('');
  });

  it('are in the shadcn-svelte Prettier style (run `pnpm registry:format`)', () => {
    const prettier = resolve(SVELTE_REGISTRY, 'node_modules/.bin/prettier');

    expect(prettierCheck({ prettier, cwd: SVELTE_REGISTRY, dirs: SVELTE_SHIPPED_DIRS })).toBe('');
  });
});
