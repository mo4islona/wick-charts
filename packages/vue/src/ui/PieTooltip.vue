<script setup lang="ts">
import { computed } from 'vue';
import { useChartInstance } from '../context';
import { useCrosshairPosition } from '../composables';

const props = defineProps<{
  seriesId: string;
}>();

const chart = useChartInstance();
const crosshair = useCrosshairPosition(chart);

const theme = computed(() => chart.getTheme());

const info = computed(() => {
  // Re-evaluate when crosshair moves
  void crosshair.value;
  return chart.getPieHoverInfo(props.seriesId);
});

const tooltipPos = computed(() => {
  if (!crosshair.value || !info.value) return null;
  const mediaSize = chart.getMediaSize();
  const tooltipWidth = 160;
  const tooltipHeight = 70;
  const offsetX = 16;
  const offsetY = 16;

  const left =
    crosshair.value.mediaX + offsetX + tooltipWidth > mediaSize.width
      ? crosshair.value.mediaX - offsetX - tooltipWidth
      : crosshair.value.mediaX + offsetX;
  const top =
    crosshair.value.mediaY + offsetY + tooltipHeight > mediaSize.height
      ? crosshair.value.mediaY - offsetY - tooltipHeight
      : crosshair.value.mediaY + offsetY;

  return { left, top };
});
</script>

<template>
  <div
    v-if="info && crosshair && tooltipPos"
    :style="{
      position: 'absolute',
      left: tooltipPos.left + 'px',
      top: tooltipPos.top + 'px',
      pointerEvents: 'none',
      background: theme.tooltip.background,
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid ' + theme.tooltip.borderColor,
      borderRadius: '8px',
      padding: '10px 14px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06)',
      fontSize: theme.typography.fontSize + 'px',
      fontFamily: theme.typography.fontFamily,
      color: theme.tooltip.textColor,
      zIndex: 10,
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
    }"
  >
    <!-- Label row -->
    <div :style="{ display: 'flex', alignItems: 'center', gap: '8px' }">
      <span
        :style="{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: info.color,
          flexShrink: 0,
        }"
      />
      <span :style="{ fontWeight: 600 }">{{ info.label }}</span>
    </div>
    <!-- Value + percent -->
    <div :style="{ display: 'flex', justifyContent: 'space-between', gap: '16px' }">
      <span :style="{ opacity: 0.6 }">{{ info.value.toLocaleString() }}</span>
      <span :style="{ fontWeight: 600 }">{{ info.percent.toFixed(1) }}%</span>
    </div>
  </div>
</template>
