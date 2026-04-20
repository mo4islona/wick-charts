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
  /** `'isolate'` shows only the clicked item; `'solo'` is a @deprecated alias. */
  export let mode: 'toggle' | 'isolate' | 'solo' = 'toggle';

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

  // Reference bump + chart + items explicitly so Svelte's compiler tracks the
  // deps without relying on detection inside an IIFE body.
  function buildResolved(
    c: typeof chart,
    itemsArg: LegendItem[] | undefined,
    _bumpDep: number,
  ): ResolvedItem[] {
    void _bumpDep;
    if (itemsArg) {
      return itemsArg.map((item, i) => ({ ...item, seriesId: '', layerIndex: i, isLayer: false }));
    }
    if (!c) return [];
    const result: ResolvedItem[] = [];
    for (const id of c.getSeriesIds()) {
      const layers = c.getSeriesLayers(id);
      if (layers) {
        const baseLabel = c.getSeriesLabel(id);
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
        const color = c.getSeriesColor(id);
        const label = c.getSeriesLabel(id);
        if (color) result.push({ label: label ?? 'Series', color, seriesId: id, layerIndex: 0, isLayer: false });
      }
    }
    return result;
  }

  $: resolved = buildResolved(chart, items, bump);

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
    if (mode === 'isolate' || mode === 'solo') {
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
      {#if item.seriesId}
        <button
          type="button"
          on:click={() => handleClick(i)}
          style="display:flex;align-items:center;gap:4px;cursor:pointer;opacity:{disabled.has(i)
            ? 0.35
            : 1};transition:opacity 0.15s ease;user-select:none;border:none;background:transparent;padding:0;margin:0;font:inherit;color:inherit;text-align:left;"
        >
          <span style="width:8px;height:8px;border-radius:2px;background:{item.color};flex-shrink:0;" />
          <span style="white-space:nowrap;">{item.label}</span>
        </button>
      {:else}
        <div
          style="display:flex;align-items:center;gap:4px;opacity:{disabled.has(i)
            ? 0.35
            : 1};user-select:none;"
        >
          <span style="width:8px;height:8px;border-radius:2px;background:{item.color};flex-shrink:0;" />
          <span style="white-space:nowrap;">{item.label}</span>
        </div>
      {/if}
    {/each}
  </div>
{/if}
