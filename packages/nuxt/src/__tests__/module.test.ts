import { addComponent, addImports, extendViteConfig } from '@nuxt/kit';
import type { Component, Nuxt, ViteConfig } from '@nuxt/schema';
import * as vue from '@wick-charts/vue';
import { pascalCase } from 'scule';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import nuxtModule, { type ModuleOptions } from '../module';

/**
 * The module registers `@wick-charts/vue` with Nuxt. These tests run its setup
 * against stubbed kit helpers and check the registrations against the real
 * exports of the Vue package, so a new component or composable cannot ship
 * without a registration.
 */

const warn = vi.fn();

vi.mock('@nuxt/kit', () => ({
  defineNuxtModule: (definition: unknown) => definition,
  addComponent: vi.fn(),
  addImports: vi.fn(),
  extendViteConfig: vi.fn(),
  useLogger: () => ({ warn }),
}));

interface Definition {
  meta: { configKey: string };
  defaults: ModuleOptions;
  setup: (options: ModuleOptions, nuxt: Nuxt) => void;
}

const definition = nuxtModule as unknown as Definition;

type Hooks = Map<string, Array<(...args: unknown[]) => void>>;

function fakeNuxt(): { nuxt: Nuxt; hoist: string[]; hooks: Hooks } {
  const hoist: string[] = [];
  const hooks: Hooks = new Map();
  const hook = (name: string, callback: (...args: unknown[]) => void) => {
    hooks.set(name, [...(hooks.get(name) ?? []), callback]);
  };
  const nuxt = { options: { typescript: { hoist } }, hook } as unknown as Nuxt;

  return { nuxt, hoist, hooks };
}

function runSetup(options: Partial<ModuleOptions> = {}): { hoist: string[]; hooks: Hooks } {
  const { nuxt, hoist, hooks } = fakeNuxt();
  definition.setup({ ...definition.defaults, ...options }, nuxt);

  return { hoist, hooks };
}

function callHook(hooks: Hooks, name: string, ...args: unknown[]): void {
  for (const callback of hooks.get(name) ?? []) {
    callback(...args);
  }
}

/**
 * The component list as Nuxt builds it: the app's files, then ours. Another component of the `all` mode
 * outranks ours; `addComponent` keeps ours next to a component of another mode.
 */
function resolvedComponents(others: Component[]): Component[] {
  const ours = registeredComponents().map(
    (entry) =>
      ({ pascalName: pascalCase(entry.name), export: entry.export, filePath: entry.filePath, mode: 'all' }) as Component,
  );
  const outranking = others.filter((component) => component.mode === 'all');
  const taken = new Set(outranking.map((component) => component.pascalName));

  return [...others, ...ours.filter((component) => !taken.has(component.pascalName))];
}

function appComponent(args: { name: string; mode: 'all' | 'client' | 'server'; shortPath: string }): Component {
  return {
    pascalName: args.name,
    export: 'default',
    mode: args.mode,
    filePath: `/app/${args.shortPath}`,
    shortPath: args.shortPath,
  } as Component;
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

  it('warns once for each name that another component takes', () => {
    const { hooks } = runSetup({ prefix: '' });
    const components = resolvedComponents([
      {
        pascalName: 'Title',
        export: 'Title',
        mode: 'all',
        filePath: '/nuxt/head/components',
        shortPath: 'nuxt/head',
      } as Component,
      appComponent({ name: 'Tooltip', mode: 'all', shortPath: 'components/Tooltip.vue' }),
    ]);

    callHook(hooks, 'modules:done');
    callHook(hooks, 'components:extend', components);
    callHook(hooks, 'components:extend', components);

    const messages = warn.mock.calls.map(([message]) => String(message));

    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain('<Title> resolves to nuxt/head, not');
    expect(messages[1]).toContain('<Tooltip> resolves to components/Tooltip.vue, not');
  });

  it('warns about a client or server file that wins in its render mode', () => {
    const { hooks } = runSetup();
    const components = resolvedComponents([
      appComponent({ name: 'WickLegend', mode: 'server', shortPath: 'components/WickLegend.server.vue' }),
      appComponent({ name: 'WickTooltip', mode: 'client', shortPath: 'components/WickTooltip.client.vue' }),
    ]);

    callHook(hooks, 'modules:done');
    callHook(hooks, 'components:extend', components);

    const messages = warn.mock.calls.map(([message]) => String(message));

    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain('<WickLegend> resolves to components/WickLegend.server.vue on the server');
    expect(messages[1]).toContain('<WickTooltip> resolves to components/WickTooltip.client.vue in the browser');
  });

  it('matches a prefixed name in the form that Nuxt registers', () => {
    const { hooks } = runSetup({ prefix: 'Wick-' });
    const components = resolvedComponents([
      appComponent({ name: 'WickTooltip', mode: 'all', shortPath: 'components/WickTooltip.vue' }),
    ]);

    callHook(hooks, 'modules:done');
    callHook(hooks, 'components:extend', components);

    const messages = warn.mock.calls.map(([message]) => String(message));

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('<WickTooltip> resolves to components/WickTooltip.vue, not');
  });

  it('stays quiet when every name resolves to the Vue package', () => {
    const { hooks } = runSetup();
    // A module that adds a client component after ours does not outrank it.
    const later = appComponent({ name: 'WickTooltip', mode: 'client', shortPath: 'modules/tooltip.client.vue' });

    callHook(hooks, 'modules:done');
    callHook(hooks, 'components:extend', [...resolvedComponents([]), later]);

    expect(warn).not.toHaveBeenCalled();
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
