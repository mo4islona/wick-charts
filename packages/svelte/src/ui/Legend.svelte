<script context="module" lang="ts">
  export interface LegendItem {
    label: string;
    color: string;
  }
</script>

<script lang="ts">
  import { onDestroy } from 'svelte';

  import { getChartContext, getLegendAnchor, getLegendRightAnchor, getThemeContext } from '../context';
  import { portal } from './portal';

  export let items: LegendItem[] | undefined = undefined;
  export let position: 'bottom' | 'right' = 'bottom';
  export let mode: 'toggle' | 'solo' = 'toggle';

  interface ResolvedItem extends LegendItem {
    seriesId: string;
    layerIndex: number;
    isLayer: boolean;
  }

  const chartStore = getChartContext();
  const themeStore = getThemeContext();
  const bottomAnchorStore = getLegendAnchor();
  const rightAnchorStore = getLegendRightAnchor();

  let disabled = new Set<number>();
  let bump = 0;
  let seriesChangeUnsub: (() => void) | null = null;
  let dataUpdateUnsub: (() => void) | null = null;

  $: {
    const c = $chartStore;
    if (c && !seriesChangeUnsub) {
      const onSeries = () => {
        bump++;
        disabled = new Set();
      };
      const onData = () => {
        bump++;
      };
      c.on('seriesChange', onSeries);
      c.on('dataUpdate', onData);
      seriesChangeUnsub = () => c.off('seriesChange', onSeries);
      dataUpdateUnsub = () => c.off('dataUpdate', onData);
      if (c.getSeriesIds().length > 0) bump++;
    }
  }

  onDestroy(() => {
    seriesChangeUnsub?.();
    dataUpdateUnsub?.();
  });

  $: chart = $chartStore;
  $: theme = $themeStore;
  $: anchor = position === 'right' ? $rightAnchorStore : $bottomAnchorStore;

  $: resolved = (() => {
    void bump;
    if (items) {
      return items.map((item, i) => ({ ...item, seriesId: '', layerIndex: i, isLayer: false }));
    }
    if (!chart) return [] as ResolvedItem[];
    const result: ResolvedItem[] = [];
    for (const id of chart.getSeriesIds()) {
      const layers = chart.getSeriesLayers(id);
      if (layers) {
        const baseLabel = chart.getSeriesLabel(id);
        for (let i = 0; i < layers.length; i++) {
          result.push({
            label: baseLabel ? `${baseLabel} ${i + 1}` : `Series ${i + 1}`,
            color: layers[i].color,
            seriesId: id,
            layerIndex: i,
            isLayer: true,
          });
        }
      } else {
        const color = chart.getSeriesColor(id);
        const label = chart.getSeriesLabel(id);
        if (color) result.push({ label: label ?? 'Series', color, seriesId: id, layerIndex: 0, isLayer: false });
      }
    }
    return result;
  })();

  function apply(next: Set<number>) {
    disabled = next;
    const list = resolved;
    const c = chart;
    if (!c) return;
    c.batch(() => {
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (!item.seriesId) continue;
        if (item.isLayer) {
          c.setLayerVisible(item.seriesId, item.layerIndex, !next.has(i));
        } else {
          c.setSeriesVisible(item.seriesId, !next.has(i));
        }
      }
    });
  }

  function handleClick(index: number) {
    const list = resolved;
    if (mode === 'solo') {
      const allOthersOff = list.every((_, i) => i === index || disabled.has(i));
      if (allOthersOff) {
        apply(new Set());
      } else {
        const next = new Set(list.map((_, i) => i));
        next.delete(index);
        apply(next);
      }
    } else {
      const s = new Set(disabled);
      if (s.has(index)) s.delete(index);
      else s.add(index);
      apply(s);
    }
  }
</script>

{#if anchor && theme && resolved.length > 0}
  <div
    use:portal={anchor}
    data-legend={position}
    style="display:flex;flex-direction:{position === 'right'
      ? 'column'
      : 'row'};flex-wrap:wrap;gap:{position === 'right'
      ? '6px'
      : '14px'};padding:{position === 'right'
      ? '8px 6px'
      : '6px 8px'};align-items:{position === 'right'
      ? 'flex-start'
      : 'center'};justify-content:{position === 'right'
      ? 'flex-start'
      : 'center'};font-family:{theme.typography.fontFamily};font-size:{theme.typography.axisFontSize}px;color:{theme.axis.textColor};pointer-events:auto;flex-shrink:0;"
  >
    {#each resolved as item, i (i)}
      <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
      <div
        on:click={() => item.seriesId && handleClick(i)}
        style="display:flex;align-items:center;gap:4px;cursor:{item.seriesId
          ? 'pointer'
          : 'default'};opacity:{disabled.has(i) ? 0.35 : 1};transition:opacity 0.15s ease;user-select:none;"
      >
        <span style="width:8px;height:8px;border-radius:2px;background:{item.color};flex-shrink:0;" />
        <span style="white-space:nowrap;">{item.label}</span>
      </div>
    {/each}
  </div>
{/if}
