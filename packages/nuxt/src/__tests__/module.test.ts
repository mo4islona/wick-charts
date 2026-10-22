import { addComponent, addImports, extendViteConfig } from '@nuxt/kit';
import type { Nuxt, ViteConfig } from '@nuxt/schema';
import * as vue from '@wick-charts/vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import nuxtModule, { type ModuleOptions } from '../module';

/**
 * The module registers `@wick-charts/vue` with Nuxt. These tests run its setup
 * against stubbed kit helpers and check the registrations against the real
 * exports of the Vue package, so a new component or composable cannot ship
 * without a registration.
 */

vi.mock('@nuxt/kit', () => ({
  defineNuxtModule: (definition: unknown) => definition,
  addComponent: vi.fn(),
  addImports: vi.fn(),
  extendViteConfig: vi.fn(),
}));

interface Definition {
  meta: { configKey: string };
  defaults: ModuleOptions;
  setup: (options: ModuleOptions, nuxt: Nuxt) => void;
}

const definition = nuxtModule as unknown as Definition;

function fakeNuxt(): { nuxt: Nuxt; hoist: string[] } {
  const hoist: string[] = [];
  const nuxt = { options: { typescript: { hoist } } } as unknown as Nuxt;

  return { nuxt, hoist };
}

function runSetup(options: Partial<ModuleOptions> = {}): { hoist: string[] } {
  const { nuxt, hoist } = fakeNuxt();
  definition.setup({ ...definition.defaults, ...options }, nuxt);

  return { hoist };
}

function vueComponentNames(): string[] {
  const names = Object.entries(vue)
    .filter(([, value]) => typeof value === 'object' && value !== null && 'setup' in value)
    .map(([name]) => name);

  return names.sort();
}

function vueComposableNames(): string[] {
  return Object.keys(vue)
    .filter((name) => /^use[A-Z]/.test(name))
    .sort();
}

function registeredComponents(): Array<{ name: string; export: string; filePath: string }> {
  return vi.mocked(addComponent).mock.calls.map(([options]) => ({
    name: options.name,
    export: options.export ?? '',
    filePath: options.filePath,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('@wick-charts/nuxt', () => {
  it('reads its options from the wickCharts key', () => {
    expect(definition.meta.configKey).toBe('wickCharts');
    expect(definition.defaults).toEqual({ prefix: 'Wick', composables: true });
  });

  it('registers every Vue component under the Wick prefix', () => {
    runSetup();

    const registered = registeredComponents();
    const exports = registered.map((entry) => entry.export).sort();

    expect(exports).toEqual(vueComponentNames());
    for (const entry of registered) {
      expect(entry.name).toBe(`Wick${entry.export}`);
      expect(entry.filePath).toBe('@wick-charts/vue');
    }
  });

  it('uses a custom prefix', () => {
    runSetup({ prefix: 'Chart' });

    const names = registeredComponents().map((entry) => entry.name);

    expect(names).toContain('ChartChartContainer');
    expect(names).toContain('ChartLineSeries');
    expect(names.every((name) => name.startsWith('Chart'))).toBe(true);
  });

  it('auto-imports every composable except useTheme', () => {
    runSetup();

    const calls = vi.mocked(addImports).mock.calls;
    const imports = calls.flatMap(([entries]) => (Array.isArray(entries) ? entries : [entries]));
    const names = imports.map((entry) => entry.name).sort();
    const expected = vueComposableNames().filter((name) => name !== 'useTheme');

    expect(names).toEqual(expected);
    expect(imports.every((entry) => entry.from === '@wick-charts/vue')).toBe(true);
  });

  it('skips the composables when they are turned off', () => {
    runSetup({ composables: false });

    expect(addImports).not.toHaveBeenCalled();
    expect(addComponent).toHaveBeenCalled();
  });

  it('hoists the Vue package types and pre-bundles it for the dev server', () => {
    const { hoist } = runSetup();

    expect(hoist).toEqual(['@wick-charts/vue']);

    const extend = vi.mocked(extendViteConfig).mock.calls[0]?.[0];
    const config: ViteConfig = { optimizeDeps: { include: ['lodash-es'] } };
    extend?.(config);

    expect(config.optimizeDeps?.include).toEqual(['lodash-es', '@wick-charts/nuxt > @wick-charts/vue']);
  });
});
