import type { ChartInstance, ChartTheme } from '@wick-charts/core';
import { type InjectionKey, type Ref, type ShallowRef, inject } from 'vue';

export const ChartKey: InjectionKey<ShallowRef<ChartInstance | null>> = Symbol('wick-chart');
export const ThemeKey: InjectionKey<ShallowRef<ChartTheme>> = Symbol('wick-theme');

/**
 * DOM anchor for a hoisted overlay component (Title, InfoBar, Legend).
 * The child component teleports its output into the anchor the container
 * provides, so the chart owns its own header / info-bar / footer layout.
 */
export const TitleAnchorKey: InjectionKey<Ref<HTMLElement | null>> = Symbol('wick-title-anchor');
export const InfoBarAnchorKey: InjectionKey<Ref<HTMLElement | null>> = Symbol('wick-info-bar-anchor');
export const LegendAnchorKey: InjectionKey<Ref<HTMLElement | null>> = Symbol('wick-legend-anchor');
export const LegendRightAnchorKey: InjectionKey<Ref<HTMLElement | null>> = Symbol('wick-legend-right-anchor');
export const NavigatorAnchorKey: InjectionKey<Ref<HTMLElement | null>> = Symbol('wick-navigator-anchor');

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
