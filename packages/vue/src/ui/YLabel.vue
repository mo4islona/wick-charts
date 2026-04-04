<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';

import { useLastYValue, usePreviousClose } from '../composables';
import { useChartInstance } from '../context';
import NumberFlow from './NumberFlow.vue';

const props = defineProps<{
  seriesId: string;
  color?: string;
}>();

const chart = useChartInstance();
const lastY = useLastYValue(chart, props.seriesId);
const previousClose = usePreviousClose(chart, props.seriesId);

onMounted(() => chart.setYLabel(true));
onUnmounted(() => chart.setYLabel(false));

const theme = computed(() => chart.getTheme());

const y = computed(() => {
  if (lastY.value === null) return 0;
  return chart.yScale.valueToY(lastY.value);
});

const bgColor = computed(() => {
  if (props.color) return props.color;
  const t = theme.value;
  if (previousClose.value === null || lastY.value === null) {
    return t.yLabel.neutralBackground;
  }
  if (lastY.value > previousClose.value) return t.yLabel.upBackground;
  if (lastY.value < previousClose.value) return t.yLabel.downBackground;
  return t.yLabel.neutralBackground;
});

const fractionDigits = computed(() => {
  const yRange = chart.yScale.getRange();
  const range = yRange.max - yRange.min;
  if (range < 0.1) return 6;
  if (range < 10) return 4;
  if (range < 1000) return 2;
  return 0;
});

const numberFormat = computed(() => ({
  minimumFractionDigits: fractionDigits.value,
  maximumFractionDigits: fractionDigits.value,
  useGrouping: false,
}));
</script>

<template>
  <template v-if="lastY !== null">
    <!-- Horizontal dashed line -->
    <div
      :style="{
        position: 'absolute',
        left: '0',
        right: chart.yAxisWidth + 'px',
        top: y + 'px',
        height: '0',
        borderTop: '1px dashed ' + bgColor,
        opacity: 0.5,
        pointerEvents: 'none',
        zIndex: 2,
      }"
    />
    <!-- Value badge -->
    <div
      :style="{
        position: 'absolute',
        right: '4px',
        top: y + 'px',
        transform: 'translateY(-50%)',
        pointerEvents: 'auto',
        zIndex: 3,
        background: bgColor,
        color: theme.yLabel.textColor,
        fontSize: theme.typography.yFontSize + 'px',
        fontFamily: theme.typography.fontFamily,
        padding: '3px 8px',
        borderRadius: '3px',
        whiteSpace: 'nowrap',
        transition: 'background-color 0.3s ease',
      }"
    >
      <NumberFlow
        :value="lastY"
        :format="numberFormat"
        :spin-duration="350"
      />
    </div>
  </template>
</template>
