import {
  type ChartTheme,
  type ThemePreset,
  andromeda,
  ayuMirage,
  catppuccin,
  dracula,
  githubLight,
  gruvbox,
  handwritten,
  highContrast,
  lavenderMist,
  lightPink,
  materialPalenight,
  minimalLight,
  mintBreeze,
  monokaiPro,
  nightOwl,
  oneDarkPro,
  panda,
  peachCream,
  quietLight,
  rosePineDawn,
  sandDune,
  solarizedLight,
} from '@wick-charts/core';

import { RenderSpecError } from './errors';

const PRESETS = {
  andromeda,
  ayuMirage,
  catppuccin,
  dracula,
  githubLight,
  gruvbox,
  handwritten,
  highContrast,
  lavenderMist,
  lightPink,
  materialPalenight,
  minimalLight,
  mintBreeze,
  monokaiPro,
  nightOwl,
  oneDarkPro,
  panda,
  peachCream,
  quietLight,
  rosePineDawn,
  sandDune,
  solarizedLight,
} satisfies Record<string, ThemePreset>;

export type ThemeName = keyof typeof PRESETS;

export const THEME_NAMES = Object.keys(PRESETS) as ThemeName[];

/** `githubLight`, `github-light` and `GitHub Light` all name one theme. */
function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const BY_NAME = new Map<string, ThemePreset>();
for (const [key, preset] of Object.entries(PRESETS)) {
  BY_NAME.set(normalize(key), preset);
  BY_NAME.set(normalize(preset.name), preset);
}

export function resolveTheme(theme: string | ChartTheme | ThemePreset | undefined): ChartTheme {
  if (theme === undefined) return catppuccin.theme;
  if (typeof theme !== 'string') return isPreset(theme) ? theme.theme : theme;

  const preset = BY_NAME.get(normalize(theme));
  if (preset === undefined) {
    throw new RenderSpecError(`theme: unknown theme "${theme}". Use one of: ${THEME_NAMES.join(', ')}.`);
  }

  return preset.theme;
}

/** A preset such as `githubLight` or a `createTheme()` result: the app passes its `.theme`. */
function isPreset(theme: ChartTheme | ThemePreset): theme is ThemePreset {
  return 'theme' in theme && typeof theme.theme === 'object';
}
