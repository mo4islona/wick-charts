<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref } from 'vue';

import { LegendAnchorKey, LegendRightAnchorKey, ThemeKey, useChartInstance } from '../context';

export interface LegendItem {
  label: string;
  color: string;
}

interface ResolvedItem extends LegendItem {
  seriesId: string;
  layerIndex: number;
  isLayer: boolean;
}

const props = withDefaults(
  defineProps<{
    items?: LegendItem[];
    position?: 'bottom' | 'right';
    mode?: 'toggle' | 'solo';
  }>(),
  {
    position: 'bottom',
    mode: 'toggle',
  },
);

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

const disabled = ref<Set<number>>(new Set());
const bump = ref(0);

const seriesChangeHandler = () => {
  bump.value++;
  disabled.value = new Set();
};
const dataUpdateHandler = () => {
  bump.value++;
};

onMounted(() => {
  chart.on('seriesChange', seriesChangeHandler);
  chart.on('dataUpdate', dataUpdateHandler);
  if (chart.getSeriesIds().length > 0) bump.value++;
});

onUnmounted(() => {
  chart.off('seriesChange', seriesChangeHandler);
  chart.off('dataUpdate', dataUpdateHandler);
});

const resolved = computed<ResolvedItem[]>(() => {
  void bump.value;
  if (props.items) {
    return props.items.map((item, i) => ({ ...item, seriesId: '', layerIndex: i, isLayer: false }));
  }
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
});

function apply(next: Set<number>) {
  disabled.value = next;
  const list = resolved.value;
  chart.batch(() => {
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (!item.seriesId) continue;
      if (item.isLayer) {
        chart.setLayerVisible(item.seriesId, item.layerIndex, !next.has(i));
      } else {
        chart.setSeriesVisible(item.seriesId, !next.has(i));
      }
    }
  });
}

function handleClick(index: number) {
  const list = resolved.value;
  if (props.mode === 'solo') {
    const allOthersOff = list.every((_, i) => i === index || disabled.value.has(i));
    if (allOthersOff) {
      apply(new Set());
    } else {
      const next = new Set(list.map((_, i) => i));
      next.delete(index);
      apply(next);
    }
  } else {
    const s = new Set(disabled.value);
    if (s.has(index)) s.delete(index);
    else s.add(index);
    apply(s);
  }
}
</script>

<template>
  <Teleport v-if="anchor && theme && resolved.length > 0" :to="anchor">
    <div
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
        fontSize: theme.typography.axisFontSize + 'px',
        color: theme.axis.textColor,
        pointerEvents: 'auto',
        flexShrink: 0,
      }"
    >
      <template v-for="(item, i) in resolved" :key="i">
        <button
          v-if="item.seriesId"
          type="button"
          @click="handleClick(i)"
          :style="{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            cursor: 'pointer',
            opacity: disabled.has(i) ? 0.35 : 1,
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
        <div
          v-else
          :style="{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            opacity: disabled.has(i) ? 0.35 : 1,
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
      </template>
    </div>
  </Teleport>
</template>
