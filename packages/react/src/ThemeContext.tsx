import { createContext, useContext } from 'react';

import type { ChartTheme } from '@wick-charts/core';

const ThemeCtx = createContext<ChartTheme | null>(null);

export const ThemeProvider = ThemeCtx.Provider;

/** Read the current chart theme from context. Must be inside a ThemeProvider. */
export function useTheme(): ChartTheme {
  const theme = useContext(ThemeCtx);
  if (!theme) {
    throw new Error('useTheme must be used within <ThemeProvider>');
  }
  return theme;
}

/** Read the theme from context, or return null if no provider. */
export function useThemeOptional(): ChartTheme | null {
  return useContext(ThemeCtx);
}
