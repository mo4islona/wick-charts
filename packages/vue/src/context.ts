import { inject, type InjectionKey, type ShallowRef } from 'vue';
import type { ChartInstance, ChartTheme } from '@wick-charts/core';

export const ChartKey: InjectionKey<ShallowRef<ChartInstance | null>> = Symbol('wick-chart');
export const ThemeKey: InjectionKey<ShallowRef<ChartTheme>> = Symbol('wick-theme');

export function useChartInstance(): ChartInstance {
  const chartRef = inject(ChartKey);
  if (!chartRef || !chartRef.value) {
    throw new Error('useChartInstance must be used within <ChartContainer>');
  }
  return chartRef.value;
}

export function useTheme(): ShallowRef<ChartTheme> {
  const themeRef = inject(ThemeKey);
  if (!themeRef) {
    throw new Error('useTheme must be used within <ChartContainer>');
  }
  return themeRef;
}
