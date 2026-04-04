import type { ChartInstance, ChartTheme } from '@wick-charts/core';
import { getContext, setContext } from 'svelte';
import { type Readable, type Writable, writable } from 'svelte/store';

const CHART_KEY = Symbol('wick-chart');
const THEME_KEY = Symbol('wick-theme');

export function initChartContext(): Writable<ChartInstance | null> {
  const store = writable<ChartInstance | null>(null);
  setContext(CHART_KEY, store);
  return store;
}

export function initThemeContext(initial: ChartTheme): Writable<ChartTheme> {
  const store = writable<ChartTheme>(initial);
  setContext(THEME_KEY, store);
  return store;
}

export function getChartContext(): Readable<ChartInstance | null> {
  return getContext<Readable<ChartInstance | null>>(CHART_KEY);
}

export function getThemeContext(): Readable<ChartTheme> {
  return getContext<Readable<ChartTheme>>(THEME_KEY);
}
