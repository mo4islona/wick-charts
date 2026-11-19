import type { ReactNode } from 'react';

import { renderHook } from '@testing-library/react';
import { ThemeProvider, githubLight, useTheme, useThemeOptional } from '@wick-charts/react';
import { describe, expect, it } from 'vitest';

describe('<ThemeProvider>', () => {
  it('takes a theme preset as well as its .theme', () => {
    const preset = ({ children }: { children: ReactNode }) => (
      <ThemeProvider value={githubLight}>{children}</ThemeProvider>
    );
    const theme = ({ children }: { children: ReactNode }) => (
      <ThemeProvider value={githubLight.theme}>{children}</ThemeProvider>
    );

    expect(renderHook(() => useTheme(), { wrapper: preset }).result.current).toBe(githubLight.theme);
    expect(renderHook(() => useThemeOptional(), { wrapper: preset }).result.current).toBe(githubLight.theme);
    expect(renderHook(() => useTheme(), { wrapper: theme }).result.current).toBe(githubLight.theme);
  });
});
