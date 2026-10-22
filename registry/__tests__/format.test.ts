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

function prettierCheck(): string {
  try {
    execFileSync(resolve(ROOT, 'node_modules/.bin/prettier'), ['--check', ...SHIPPED_DIRS], {
      cwd: ROOT,
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
    expect(prettierCheck()).toBe('');
  });
});
