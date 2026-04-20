<script lang="ts">
import { type AxisConfig, ChartInstance, type ChartTheme, darkTheme } from '@wick-charts/core';
import { onDestroy, onMount, tick } from 'svelte';

import {
  initChartContext,
  initInfoBarAnchor,
  initLegendAnchor,
  initLegendRightAnchor,
  initThemeContext,
  initTitleAnchor,
} from './context';

export let theme: ChartTheme = darkTheme;
export let axis: AxisConfig | undefined = undefined;
/** Background grid configuration. Default: `{ visible: true }`. */
export let grid: { visible: boolean } | undefined = undefined;
export let style: string = '';

let containerEl: HTMLDivElement;
let topOverlayEl: HTMLDivElement;
let titleAnchorEl: HTMLDivElement;
let infoBarAnchorEl: HTMLDivElement;
let legendAnchorEl: HTMLDivElement;
let legendRightAnchorEl: HTMLDivElement;

const chartStore = initChartContext();
const themeStore = initThemeContext(theme);
const titleAnchorStore = initTitleAnchor();
const infoBarAnchorStore = initInfoBarAnchor();
const legendAnchorStore = initLegendAnchor();
const legendRightAnchorStore = initLegendRightAnchor();

let instance: ChartInstance | null = null;
let resizeObserver: ResizeObserver | null = null;
let topOverlayHeight = 0;

function applyPadding() {
  instance?.setPadding({ top: 20 + topOverlayHeight });
}

onMount(() => {
  const options: any = {};
  if (axis) options.axis = axis;
  if (theme) options.theme = theme;
  if (grid !== undefined) options.grid = grid;
  instance = new ChartInstance(containerEl, options);
  chartStore.set(instance);
  // Publish anchors only after DOM is mounted so child components (Title,
  // InfoBar, Legend) can subscribe and portal into them.
  void tick().then(() => {
    titleAnchorStore.set(titleAnchorEl);
    infoBarAnchorStore.set(infoBarAnchorEl);
    legendAnchorStore.set(legendAnchorEl);
    legendRightAnchorStore.set(legendRightAnchorEl);
    // Measure the stacked top overlay (title + info bar) so data respects
    // that reserved space; the canvas itself stays full-height.
    if (topOverlayEl) {
      const measure = () => {
        topOverlayHeight = topOverlayEl.getBoundingClientRect().height;
        applyPadding();
      };
      measure();
      resizeObserver = new ResizeObserver(measure);
      resizeObserver.observe(topOverlayEl);
    }
  });
});

onDestroy(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  instance?.destroy();
  instance = null;
  chartStore.set(null);
  titleAnchorStore.set(null);
  infoBarAnchorStore.set(null);
  legendAnchorStore.set(null);
  legendRightAnchorStore.set(null);
});

$: if (instance && theme) {
  instance.setTheme(theme);
  themeStore.set(theme);
}

$: if (instance && axis) {
  instance.setAxis(axis);
}

$: if (instance && grid !== undefined) {
  instance.setGrid(grid);
}

$: gradientBg = (() => {
  const t = theme;
  const [gtop, gbot] = t?.chartGradient ?? ['transparent', 'transparent'];
  const bg = t?.background ?? 'transparent';
  return `linear-gradient(to bottom, ${gtop} 0%, ${bg} 70%, ${gbot} 100%)`;
})();
</script>

<div
  {style}
  style:position="relative"
  style:display="flex"
  style:flex-direction="column"
  style:width="100%"
  style:height="100%"
  style:overflow="hidden"
  style:background={gradientBg}
>
  <div style="display:flex;flex-direction:row;flex:1;min-height:0">
    <div
      bind:this={containerEl}
      style="position:relative;flex:1;min-width:0;min-height:0;overflow:hidden"
    >
      <div
        bind:this={topOverlayEl}
        data-chart-top-overlay=""
        style="position:absolute;top:0;left:0;right:0;z-index:2;pointer-events:none;display:flex;flex-direction:column"
      >
        <div bind:this={titleAnchorEl} data-chart-title-anchor=""></div>
        <div bind:this={infoBarAnchorEl} data-tooltip-legend-anchor=""></div>
      </div>
      {#if $chartStore}
        <div
          data-chart-series-overlay=""
          style="position:absolute;inset:0;pointer-events:none;z-index:3"
        >
          <slot />
        </div>
      {/if}
    </div>
    <div bind:this={legendRightAnchorEl} data-legend-right-anchor="" style="flex:0 0 auto"></div>
  </div>
  <div bind:this={legendAnchorEl} data-legend-anchor="" style="flex:0 0 auto"></div>
</div>
