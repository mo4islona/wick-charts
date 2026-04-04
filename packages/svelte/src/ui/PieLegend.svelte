<script lang="ts">
  import { get } from 'svelte/store';
  import { onDestroy } from 'svelte';
  import { getChartContext, getThemeContext } from '../context';
  import { createLastYValue } from '../stores';

  export let seriesId: string;
  export let format: 'value' | 'percent' = 'value';

  const chartStore = getChartContext();
  const themeStore = getThemeContext();
  let lastValue: { value: number; isLive: boolean } | null = null;
  let unsub: (() => void) | null = null;

  $: {
    const chart = $chartStore;
    if (chart && !unsub) {
      const store = createLastYValue(chart, seriesId);
      unsub = store.subscribe((v) => { lastValue = v; });
    }
  }

  onDestroy(() => { unsub?.(); });

  $: chart = $chartStore;
  $: theme = $themeStore;
  // Reference lastValue to trigger reactivity on dataUpdate events
  $: slices = (void lastValue, chart?.getPieSlices(seriesId) ?? []);

  function formatCompact(v: number): string {
    if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return v.toLocaleString();
  }
</script>

{#if slices.length > 0 && theme}
  <div
    style="display:flex;flex-direction:column;gap:6px;padding:8px 12px;font-family:{theme.typography.fontFamily};font-size:{theme.typography.fontSize}px;color:{theme.tooltip.textColor};pointer-events:auto;"
  >
    {#each slices as slice, i (i)}
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="width:10px;height:10px;border-radius:50%;background:{slice.color};flex-shrink:0;" />
        <span style="flex:1;opacity:0.8;">{slice.label}</span>
        {#if format === 'value'}
          <span style="font-weight:600;font-variant-numeric:tabular-nums;">{formatCompact(slice.value)}</span>
        {/if}
        <span
          style="opacity:{format === 'percent' ? 1 : 0.5};font-weight:{format === 'percent' ? 600 : 400};font-size:{format === 'percent' ? theme.typography.fontSize : theme.typography.axisFontSize}px;font-variant-numeric:tabular-nums;min-width:40px;text-align:right;"
        >
          {slice.percent.toFixed(1)}%
        </span>
      </div>
    {/each}
  </div>
{/if}
