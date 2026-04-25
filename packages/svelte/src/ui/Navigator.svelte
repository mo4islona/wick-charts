<script lang="ts">
import { NavigatorController, type NavigatorData } from '@wick-charts/core';
import { onDestroy } from 'svelte';

import { getChartContext, getNavigatorAnchor, getThemeContext } from '../context';
import { portal } from './portal';

export let data: NavigatorData;
/** Strip height in CSS pixels. Defaults to `theme.navigator.height` (60). */
export let height: number | undefined = undefined;

const anchorStore = getNavigatorAnchor();
const chartStore = getChartContext();
const themeStore = getThemeContext();

$: anchor = $anchorStore;
$: chart = $chartStore;
$: resolvedHeight = height ?? $themeStore.navigator.height;

let stripEl: HTMLDivElement;
let controller: NavigatorController | null = null;

// Mount once both the strip element and chart are available. Svelte fires
// this reactively whenever either arrives — the guard ensures a single mount.
$: if (stripEl && chart && !controller) {
  controller = new NavigatorController({
    container: stripEl,
    chart,
    data,
    options: height !== undefined ? { height } : undefined,
  });
}

$: if (controller) controller.setData(data);
$: if (controller) controller.setOptions(height !== undefined ? { height } : {});

onDestroy(() => {
  controller?.destroy();
  controller = null;
});
</script>

{#if anchor}
  <div
    bind:this={stripEl}
    use:portal={anchor}
    data-chart-navigator=""
    style="position:relative;width:100%;height:{resolvedHeight}px;flex-shrink:0"
  ></div>
{/if}
