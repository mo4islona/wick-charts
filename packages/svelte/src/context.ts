import type { ChartInstance, ChartTheme } from '@wick-charts/core';
import { getContext, setContext } from 'svelte';
import { type Readable, type Writable, writable } from 'svelte/store';

const CHART_KEY = Symbol('wick-chart');
const THEME_KEY = Symbol('wick-theme');
const TITLE_ANCHOR_KEY = Symbol('wick-title-anchor');
const INFO_BAR_ANCHOR_KEY = Symbol('wick-info-bar-anchor');
const LEGEND_ANCHOR_KEY = Symbol('wick-legend-anchor');
const LEGEND_RIGHT_ANCHOR_KEY = Symbol('wick-legend-right-anchor');
const NAVIGATOR_ANCHOR_KEY = Symbol('wick-navigator-anchor');

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

/**
 * DOM anchor stores for hoisted overlays (Title, InfoBar, Legend).
 * Each child teleports its rendered output into the anchor the container
 * provides, so the chart owns its own header/info-bar layout rather than
 * having overlays absolutely positioned inside the canvas.
 */
export function initTitleAnchor(): Writable<HTMLElement | null> {
  const store = writable<HTMLElement | null>(null);
  setContext(TITLE_ANCHOR_KEY, store);
  return store;
}

export function initInfoBarAnchor(): Writable<HTMLElement | null> {
  const store = writable<HTMLElement | null>(null);
  setContext(INFO_BAR_ANCHOR_KEY, store);
  return store;
}

export function initLegendAnchor(): Writable<HTMLElement | null> {
  const store = writable<HTMLElement | null>(null);
  setContext(LEGEND_ANCHOR_KEY, store);
  return store;
}

export function initLegendRightAnchor(): Writable<HTMLElement | null> {
  const store = writable<HTMLElement | null>(null);
  setContext(LEGEND_RIGHT_ANCHOR_KEY, store);
  return store;
}

export function initNavigatorAnchor(): Writable<HTMLElement | null> {
  const store = writable<HTMLElement | null>(null);
  setContext(NAVIGATOR_ANCHOR_KEY, store);
  return store;
}

export function getTitleAnchor(): Readable<HTMLElement | null> {
  return getContext<Readable<HTMLElement | null>>(TITLE_ANCHOR_KEY);
}

export function getInfoBarAnchor(): Readable<HTMLElement | null> {
  return getContext<Readable<HTMLElement | null>>(INFO_BAR_ANCHOR_KEY);
}

export function getLegendAnchor(): Readable<HTMLElement | null> {
  return getContext<Readable<HTMLElement | null>>(LEGEND_ANCHOR_KEY);
}

export function getLegendRightAnchor(): Readable<HTMLElement | null> {
  return getContext<Readable<HTMLElement | null>>(LEGEND_RIGHT_ANCHOR_KEY);
}

export function getNavigatorAnchor(): Readable<HTMLElement | null> {
  return getContext<Readable<HTMLElement | null>>(NAVIGATOR_ANCHOR_KEY);
}
