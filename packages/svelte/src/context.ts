import type { ChartInstance, ChartTheme } from '@wick-charts/core';
import { getContext, setContext } from 'svelte';
import { type Readable, type Writable, writable } from 'svelte/store';

const CHART_KEY = Symbol('wick-chart');
const THEME_KEY = Symbol('wick-theme');
const TITLE_ANCHOR_KEY = Symbol('wick-title-anchor');
const TOOLTIP_LEGEND_ANCHOR_KEY = Symbol('wick-tooltip-legend-anchor');
const LEGEND_ANCHOR_KEY = Symbol('wick-legend-anchor');
const LEGEND_RIGHT_ANCHOR_KEY = Symbol('wick-legend-right-anchor');

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
 * DOM anchor stores for hoisted overlays (Title, TooltipLegend, Legend).
 * Each child teleports its rendered output into the anchor the container
 * provides, so the chart owns its own header/info-bar layout rather than
 * having overlays absolutely positioned inside the canvas.
 */
export function initTitleAnchor(): Writable<HTMLElement | null> {
  const store = writable<HTMLElement | null>(null);
  setContext(TITLE_ANCHOR_KEY, store);
  return store;
}

export function initTooltipLegendAnchor(): Writable<HTMLElement | null> {
  const store = writable<HTMLElement | null>(null);
  setContext(TOOLTIP_LEGEND_ANCHOR_KEY, store);
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

export function getTitleAnchor(): Readable<HTMLElement | null> {
  return getContext<Readable<HTMLElement | null>>(TITLE_ANCHOR_KEY);
}

export function getTooltipLegendAnchor(): Readable<HTMLElement | null> {
  return getContext<Readable<HTMLElement | null>>(TOOLTIP_LEGEND_ANCHOR_KEY);
}

export function getLegendAnchor(): Readable<HTMLElement | null> {
  return getContext<Readable<HTMLElement | null>>(LEGEND_ANCHOR_KEY);
}

export function getLegendRightAnchor(): Readable<HTMLElement | null> {
  return getContext<Readable<HTMLElement | null>>(LEGEND_RIGHT_ANCHOR_KEY);
}
