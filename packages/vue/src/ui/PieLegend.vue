<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useChartInstance, useTheme } from '../context';

const props = withDefaults(defineProps<{
  seriesId: string;
  format?: 'value' | 'percent';
}>(), {
  format: 'value',
});

const chart = useChartInstance();
const themeRef = useTheme();

// Subscribe to dataUpdate directly to re-render when pie data changes
const tick = ref(0);
const handler = () => { tick.value++; };
onMounted(() => { chart.on('dataUpdate', handler); });
onUnmounted(() => { chart.off('dataUpdate', handler); });

const theme = computed(() => themeRef.value);
const slices = computed(() => { void tick.value; return chart.getSliceInfo(props.seriesId) ?? []; });

function formatCompact(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toLocaleString();
}
</script>

<template>
  <div
    v-if="slices.length > 0"
    :style="{
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      padding: '8px 12px',
      fontFamily: theme.typography.fontFamily,
      fontSize: theme.typography.fontSize + 'px',
      color: theme.tooltip.textColor,
      pointerEvents: 'auto',
    }"
  >
    <div
      v-for="(slice, i) in slices"
      :key="i"
      :style="{ display: 'flex', alignItems: 'center', gap: '10px' }"
    >
      <span :style="{ width: '10px', height: '10px', borderRadius: '50%', background: slice.color, flexShrink: 0 }" />
      <span :style="{ flex: 1, opacity: 0.8 }">{{ slice.label }}</span>
      <span
        v-if="format === 'value'"
        :style="{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }"
      >
        {{ formatCompact(slice.value) }}
      </span>
      <span
        :style="{
          opacity: format === 'percent' ? 1 : 0.5,
          fontWeight: format === 'percent' ? 600 : 400,
          fontSize: (format === 'percent' ? theme.typography.fontSize : theme.typography.axisFontSize) + 'px',
          fontVariantNumeric: 'tabular-nums',
          minWidth: '40px',
          textAlign: 'right',
        }"
      >
        {{ slice.percent.toFixed(1) }}%
      </span>
    </div>
  </div>
</template>
