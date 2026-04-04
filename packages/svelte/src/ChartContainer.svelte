<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { ChartInstance, type ChartTheme, type AxisConfig, darkTheme } from '@wick-charts/core';
  import { initChartContext, initThemeContext } from './context';

  export let theme: ChartTheme = darkTheme;
  export let axis: AxisConfig | undefined = undefined;
  export let style: string = '';

  let containerEl: HTMLDivElement;

  const chartStore = initChartContext();
  const themeStore = initThemeContext(theme);

  let instance: ChartInstance | null = null;

  onMount(() => {
    const options: any = {};
    if (axis) options.axis = axis;
    if (theme) options.theme = theme;
    instance = new ChartInstance(containerEl, options);
    chartStore.set(instance);
  });

  onDestroy(() => {
    instance?.destroy();
    instance = null;
    chartStore.set(null);
  });

  $: if (instance && theme) {
    instance.setTheme(theme);
    themeStore.set(theme);
  }

  $: if (instance && axis) {
    instance.setAxis(axis);
  }
</script>

<div
  bind:this={containerEl}
  {style}
  style:position="relative"
  style:width="100%"
  style:height="100%"
  style:overflow="hidden"
>
  {#if $chartStore}
    <div style="position:absolute;inset:0;pointer-events:none;z-index:2">
      <slot />
    </div>
  {/if}
</div>
