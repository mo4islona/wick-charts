// Per-framework metadata used by ApiPage / HookPage / Sidebar to render the
// API surface for the user's currently selected framework. The React API
// manifest is canonical (component prop sets are 1:1 across frameworks —
// enforced by scripts/check-api-parity.mjs); only the *syntax* and a handful
// of hook names diverge.

import type { Framework } from '../../context/framework';

export const FRAMEWORK_META: Record<Framework, { pkg: string; label: string }> = {
  react: { pkg: '@wick-charts/react', label: 'React' },
  vue: { pkg: '@wick-charts/vue', label: 'Vue' },
  svelte: { pkg: '@wick-charts/svelte', label: 'Svelte' },
};

/**
 * Hook renames per framework. React names are the canonical key. Vue mirrors
 * React 1:1. Svelte uses a context/store idiom with different prefixes.
 */
export const HOOK_NAMES: Record<string, Record<Framework, string>> = {
  useChartInstance: { react: 'useChartInstance', vue: 'useChartInstance', svelte: 'getChartContext' },
  useTheme: { react: 'useTheme', vue: 'useTheme', svelte: 'getThemeContext' },
  useCrosshairPosition: {
    react: 'useCrosshairPosition',
    vue: 'useCrosshairPosition',
    svelte: 'createCrosshairPosition',
  },
  useLastYValue: { react: 'useLastYValue', vue: 'useLastYValue', svelte: 'createLastYValue' },
  usePreviousClose: { react: 'usePreviousClose', vue: 'usePreviousClose', svelte: 'createPreviousClose' },
  useVisibleRange: { react: 'useVisibleRange', vue: 'useVisibleRange', svelte: 'createVisibleRange' },
  useYRange: { react: 'useYRange', vue: 'useYRange', svelte: 'createYRange' },
};

/** Returns the framework-specific name for a hook, defaulting to the React name. */
export function getHookName(reactName: string, fw: Framework): string {
  return HOOK_NAMES[reactName]?.[fw] ?? reactName;
}
