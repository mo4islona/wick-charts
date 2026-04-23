<script setup lang="ts">
import type { ChartInstance, LegendItem } from '@wick-charts/core';
import { computed, inject, onMounted, onUnmounted, ref, useSlots } from 'vue';

import { LegendAnchorKey, LegendRightAnchorKey, ThemeKey, useChartInstance } from '../context';

/**
 * Minimal visual shape the {@link LegendProps.items} override accepts. The
 * canonical {@link LegendItem} (re-exported from `@wick-charts/core`) carries
 * the full identity + closures; those aren't meaningful for a pre-baked,
 * non-interactive legend.
 */
export interface LegendItemOverride {
  label: string;
  color: string;
}

type LegendMode = 'toggle' | 'isolate' | 'solo';

const props = withDefaults(
  defineProps<{
    items?: LegendItemOverride[];
    position?: 'bottom' | 'right';
    /** `'isolate'` shows only the clicked item; `'solo'` is a @deprecated alias. */
    mode?: LegendMode;
  }>(),
  {
    position: 'bottom',
    mode: 'toggle',
  },
);

defineSlots<{
  default?(ctx: { items: readonly LegendItem[] }): unknown;
}>();

const chart = useChartInstance();
const theme = inject(ThemeKey);
const bottomAnchor = inject(LegendAnchorKey);
const rightAnchor = inject(LegendRightAnchorKey);

if (!theme) {
  throw new Error('<Legend> must be used within <ChartContainer>: missing ThemeKey.');
}
if (!bottomAnchor || !rightAnchor) {
  throw new Error('<Legend> must be used within <ChartContainer>: missing legend anchors.');
}

const anchor = computed(() => (props.position === 'right' ? rightAnchor.value : bottomAnchor.value));

const isolatedId = ref<string | null>(null);
const bump = ref(0);

const overlayHandler = () => {
  bump.value++;
};
const seriesChangeHandler = () => {
  isolatedId.value = null;
};

onMounted(() => {
  chart.on('overlayChange', overlayHandler);
  chart.on('seriesChange', seriesChangeHandler);
  if (chart.getSeriesIds().length > 0) bump.value++;
});

onUnmounted(() => {
  chart.off('overlayChange', overlayHandler);
  chart.off('seriesChange', seriesChangeHandler);
});

interface MakeItemArgs {
  id: string;
  seriesId: string;
  layerIndex: number | undefined;
  label: string;
  color: string;
  isDisabled: boolean;
}

function makeItem(args: MakeItemArgs): LegendItem {
  const { id, seriesId, layerIndex, label, color, isDisabled } = args;

  const toggle = () => {
    if (layerIndex !== undefined) {
      chart.setLayerVisible(seriesId, layerIndex, !chart.isLayerVisible(seriesId, layerIndex));
    } else {
      chart.setSeriesVisible(seriesId, !chart.isSeriesVisible(seriesId));
    }
  };

  const isolate = () => {
    if (isolatedId.value === id) {
      chart.batch(() => {
        for (const sid of chart.getSeriesIds()) {
          chart.setSeriesVisible(sid, true);
          const layers = chart.getSeriesLayers(sid);
          if (layers) {
            for (let i = 0; i < layers.length; i++) chart.setLayerVisible(sid, i, true);
          }
        }
      });
      isolatedId.value = null;

      return;
    }

    chart.batch(() => {
      for (const sid of chart.getSeriesIds()) {
        const layers = chart.getSeriesLayers(sid);
        if (layers) {
          chart.setSeriesVisible(sid, sid === seriesId);
          for (let i = 0; i < layers.length; i++) {
            chart.setLayerVisible(sid, i, sid === seriesId && i === layerIndex);
          }
        } else {
          chart.setSeriesVisible(sid, sid === id);
        }
      }
    });
    isolatedId.value = id;
  };

  return { id, seriesId, layerIndex, label, color, isDisabled, toggle, isolate };
}

function buildLegendItems(c: ChartInstance): LegendItem[] {
  const items: LegendItem[] = [];
  for (const seriesId of c.getSeriesIds()) {
    const layers = c.getSeriesLayers(seriesId);
    if (layers) {
      const baseLabel = c.getSeriesLabel(seriesId);
      for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
        const id = `${seriesId}_layer${layerIndex}`;
        const visible = c.isSeriesVisible(seriesId) && c.isLayerVisible(seriesId, layerIndex);
        items.push(
          makeItem({
            id,
            seriesId,
            layerIndex,
            label: baseLabel ? `${baseLabel} ${layerIndex + 1}` : `Series ${layerIndex + 1}`,
            color: layers[layerIndex].color,
            isDisabled: !visible,
          }),
        );
      }
    } else {
      const color = c.getSeriesColor(seriesId);
      if (!color) continue;

      const label = c.getSeriesLabel(seriesId);
      const visible = c.isSeriesVisible(seriesId);
      items.push(
        makeItem({
          id: seriesId,
          seriesId,
          layerIndex: undefined,
          label: label ?? 'Series',
          color,
          isDisabled: !visible,
        }),
      );
    }
  }

  return items;
}

const legendItems = computed<LegendItem[]>(() => {
  void bump.value;
  void isolatedId.value;

  return buildLegendItems(chart);
});

const slots = useSlots();
const hasCustomSlot = computed(() => typeof slots.default === 'function');

function handleClick(item: LegendItem) {
  if (props.mode === 'isolate' || props.mode === 'solo') item.isolate();
  else item.toggle();
}
</script>

<template>
  <Teleport v-if="anchor && theme" :to="anchor">
    <div
      v-if="hasCustomSlot && legendItems.length > 0"
      :data-legend="position"
      :style="{
        display: 'flex',
        flexDirection: position === 'right' ? 'column' : 'row',
        flexWrap: 'wrap',
        gap: position === 'right' ? '6px' : '14px',
        padding: position === 'right' ? '8px 6px' : '6px 8px',
        alignItems: position === 'right' ? 'flex-start' : 'center',
        justifyContent: position === 'right' ? 'flex-start' : 'center',
        fontFamily: theme.typography.fontFamily,
        fontSize: theme.axis.fontSize + 'px',
        color: theme.axis.textColor,
        pointerEvents: 'auto',
        flexShrink: 0,
      }"
    >
      <slot :items="legendItems" />
    </div>

    <div
      v-else-if="items && items.length > 0"
      :data-legend="position"
      :style="{
        display: 'flex',
        flexDirection: position === 'right' ? 'column' : 'row',
        flexWrap: 'wrap',
        gap: position === 'right' ? '6px' : '14px',
        padding: position === 'right' ? '8px 6px' : '6px 8px',
        alignItems: position === 'right' ? 'flex-start' : 'center',
        justifyContent: position === 'right' ? 'flex-start' : 'center',
        fontFamily: theme.typography.fontFamily,
        fontSize: theme.axis.fontSize + 'px',
        color: theme.axis.textColor,
        pointerEvents: 'auto',
        flexShrink: 0,
      }"
    >
      <div
        v-for="(item, i) in items"
        :key="i"
        :style="{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          userSelect: 'none',
        }"
      >
        <span
          :style="{
            width: '8px',
            height: '8px',
            borderRadius: '2px',
            background: item.color,
            flexShrink: 0,
          }"
        />
        <span style="white-space: nowrap">{{ item.label }}</span>
      </div>
    </div>

    <div
      v-else-if="legendItems.length > 0"
      :data-legend="position"
      :style="{
        display: 'flex',
        flexDirection: position === 'right' ? 'column' : 'row',
        flexWrap: 'wrap',
        gap: position === 'right' ? '6px' : '14px',
        padding: position === 'right' ? '8px 6px' : '6px 8px',
        alignItems: position === 'right' ? 'flex-start' : 'center',
        justifyContent: position === 'right' ? 'flex-start' : 'center',
        fontFamily: theme.typography.fontFamily,
        fontSize: theme.axis.fontSize + 'px',
        color: theme.axis.textColor,
        pointerEvents: 'auto',
        flexShrink: 0,
      }"
    >
      <button
        v-for="item in legendItems"
        :key="item.id"
        type="button"
        @click="handleClick(item)"
        :style="{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          cursor: 'pointer',
          opacity: item.isDisabled ? 0.35 : 1,
          transition: 'opacity 0.15s ease',
          userSelect: 'none',
          border: 'none',
          background: 'transparent',
          padding: 0,
          margin: 0,
          font: 'inherit',
          color: 'inherit',
          textAlign: 'left',
        }"
      >
        <span
          :style="{
            width: '8px',
            height: '8px',
            borderRadius: '2px',
            background: item.color,
            flexShrink: 0,
          }"
        />
        <span style="white-space: nowrap">{{ item.label }}</span>
      </button>
    </div>
  </Teleport>
</template>
