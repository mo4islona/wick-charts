import { createContext, useContext } from 'react';

import { type ChartTheme, type ThemeInput, resolveTheme } from '@wick-charts/core';

const ThemeCtx = createContext<ThemeInput | null>(null);

/** Gives one theme (a preset or its `.theme`) to every chart inside it. */
export const ThemeProvider = ThemeCtx.Provider;

/** Read the current chart theme from context. Must be inside a ThemeProvider. */
export function useTheme(): ChartTheme {
  const theme = useContext(ThemeCtx);
  if (!theme) {
    throw new Error('useTheme must be used within <ThemeProvider>');
  }

  return resolveTheme(theme);
}

/** Read the theme from context, or return null if no provider. */
export function useThemeOptional(): ChartTheme | null {
  const theme = useContext(ThemeCtx);

  return theme ? resolveTheme(theme) : null;
}
