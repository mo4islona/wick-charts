import type { ChartTheme } from './types';

// Re-export types and utilities
export type { ThemeConfig, ThemePreset } from './create';
export { createTheme } from './create';
// Re-export individual themes for ESM tree-shaking
export {
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
} from './themes';

import type { ThemePreset } from './create';
import {
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
} from './themes';

/** All built-in themes keyed by display name */
export const themes: Record<string, ThemePreset> = {
  Dracula: dracula,
  'One Dark Pro': oneDarkPro,
  'Monokai Pro': monokaiPro,
  'Night Owl': nightOwl,
  'Material Palenight': materialPalenight,
  Gruvbox: gruvbox,
  Catppuccin: catppuccin,
  'Ayu Mirage': ayuMirage,
  Panda: panda,
  Andromeda: andromeda,
  Matrix: highContrast,
  Handwritten: handwritten,
  'GitHub Light': githubLight,
  'Solarized Light': solarizedLight,

  'Rosé Pine Dawn': rosePineDawn,
  'Quiet Light': quietLight,
  'Lavender Mist': lavenderMist,
  'Mint Breeze': mintBreeze,
  'Sand Dune': sandDune,

  'Peach Cream': peachCream,
  Monochrome: minimalLight,
  Love: lightPink,
};

/** Lookup a theme by name (defaults to "One Dark Pro") */
export function buildTheme(themeName: string): ChartTheme {
  return (themes[themeName] ?? themes['One Dark Pro']).theme;
}
