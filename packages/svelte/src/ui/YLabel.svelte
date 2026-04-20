<script context="module" lang="ts">
/** Direction of the current value vs. previous close. Drives the badge color in the default UI. */
export type YLabelDirection = 'up' | 'down' | 'neutral';
</script>

<script lang="ts">
  import type { ChartInstance, ValueFormatter } from '@wick-charts/core';
  import { onDestroy, onMount } from 'svelte';
  import { get } from 'svelte/store';

  import { getChartContext } from '../context';
  import NumberFlow from './NumberFlow.svelte';

  /**
   * Owning series id. **Optional** — when omitted, the first visible
   * single-layer time series is picked, falling back to the first visible
   * multi-layer time series.
   */
  export let seriesId: string | undefined = undefined;
  export let color: string | undefined = undefined;
  /** Custom formatter; routed through NumberFlow so the digit animation plays. */
  export let format: ValueFormatter | undefined = undefined;

  const chartStore = getChartContext();

  // Single subscription covering data/visibility/theme/options changes, plus
  // viewportChange for pixel-Y drift on pan/zoom where the value is unchanged
  // but the badge must move.
  let bump = 0;
  let overlayUnsub: (() => void) | null = null;
  let viewportUnsub: (() => void) | null = null;

  $: {
    const c = $chartStore;
    if (c && !overlayUnsub) {
      const onChange = () => {
        bump++;
      };
      c.on('overlayChange', onChange);
      c.on('viewportChange', onChange);
      overlayUnsub = () => c.off('overlayChange', onChange);
      viewportUnsub = () => c.off('viewportChange', onChange);
      if (c.getSeriesIds().length > 0) bump++;
    }
  }

  onMount(() => {
    const c = get(chartStore);
    if (c) c.setYLabel(true);
  });

  onDestroy(() => {
    const c = get(chartStore);
    if (c) c.setYLabel(false);
    overlayUnsub?.();
    viewportUnsub?.();
  });

  function resolveSeriesId(c: ChartInstance, explicit: string | undefined): string | null {
    if (explicit !== undefined) return explicit;

    const singleLayer = c.getSeriesIdsByType('time', { visibleOnly: true, singleLayerOnly: true });
    if (singleLayer.length > 0) return singleLayer[0];

    const anyTime = c.getSeriesIdsByType('time', { visibleOnly: true });

    return anyTime.length > 0 ? anyTime[0] : null;
  }

  $: chart = $chartStore;
  $: resolvedId = chart && bump >= 0 ? resolveSeriesId(chart, seriesId) : null;
  $: last =
    chart && resolvedId !== null && bump >= 0 ? chart.getStackedLastValue(resolvedId) : (null as null | { value: number; isLive: boolean });
  $: previousClose = chart && resolvedId !== null && bump >= 0 ? chart.getPreviousClose(resolvedId) : null;
  $: theme = chart && bump >= 0 ? chart.getTheme() : null;
  $: y = chart && last !== null ? chart.yScale.valueToY(last.value) : 0;

  $: direction = ((): YLabelDirection => {
    if (last === null || previousClose === null) return 'neutral';
    if (last.value > previousClose) return 'up';
    if (last.value < previousClose) return 'down';

    return 'neutral';
  })();

  $: bgColor = ((): string => {
    if (!theme || last === null) return '#888';
    if (!last.isLive) return theme.axis.textColor;
    if (color) return color;

    return direction === 'up'
      ? theme.yLabel.upBackground
      : direction === 'down'
        ? theme.yLabel.downBackground
        : theme.yLabel.neutralBackground;
  })();

  $: fractionDigits = ((): number => {
    if (!chart) return 2;
    const yRange = chart.yScale.getRange();
    const range = yRange.max - yRange.min;
    if (range < 0.1) return 6;
    if (range < 10) return 4;
    if (range < 1000) return 2;

    return 0;
  })();

  $: intlFallback = ((): ValueFormatter => {
    const nf = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
      useGrouping: false,
    });

    return (v: number) => nf.format(v);
  })();
  $: effectiveFormat = format ?? intlFallback;
</script>

{#if last !== null && chart && theme}
  {#if $$slots.default}
    <slot
      value={last.value}
      {y}
      {bgColor}
      isLive={last.isLive}
      {direction}
      format={effectiveFormat}
    />
  {:else}
    <div
      style="position:absolute;left:0;right:{chart.yAxisWidth}px;top:{y}px;height:0;border-top:1px dashed {bgColor};opacity:0.5;pointer-events:none;z-index:2;"
    />
    <div
      style="position:absolute;right:4px;top:{y}px;transform:translateY(-50%);pointer-events:auto;z-index:3;background:{bgColor};color:{theme.yLabel.textColor};font-size:{theme.typography.yFontSize}px;font-family:{theme.typography.fontFamily};padding:3px 8px;border-radius:3px;white-space:nowrap;transition:background-color 0.3s ease;"
    >
      <NumberFlow value={last.value} format={effectiveFormat} spinDuration={350} />
    </div>
  {/if}
{/if}
