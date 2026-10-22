<script setup lang="ts">
import { NumberFlow, PieSeries, type PieSliceData, PieTooltip } from '@wick-charts/vue';
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WickChart } from '@/components/ui/wick-chart';

const TICK_MS = 2000;

const initialBrowsers: PieSliceData[] = [
  { label: 'Chrome', value: 275 },
  { label: 'Safari', value: 200 },
  { label: 'Firefox', value: 187 },
  { label: 'Edge', value: 173 },
  { label: 'Other', value: 90 },
];

const pieOptions = { innerRadiusRatio: 0.62, sliceLabels: { mode: 'none' as const } };

// Demo feed: a few new visits land on random browsers every tick.
function addVisits(slices: PieSliceData[]): PieSliceData[] {
  return slices.map((slice) => ({ ...slice, value: slice.value + Math.round(Math.random() * 6) }));
}

const browsers = shallowRef(initialBrowsers);
const total = computed(() => browsers.value.reduce((sum, slice) => sum + slice.value, 0));

let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  timer = setInterval(() => {
    browsers.value = addVisits(browsers.value);
  }, TICK_MS);
});

onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <Card>
    <CardHeader class="items-center text-center">
      <CardTitle>Visitors by browser</CardTitle>
      <CardDescription>Today, live</CardDescription>
    </CardHeader>
    <CardContent>
      <div class="relative">
        <!-- Under the chart, so the tooltip stays on top; the donut hole is transparent. -->
        <div class="absolute inset-0 flex flex-col items-center justify-center">
          <NumberFlow :value="total" class="text-3xl font-bold tabular-nums" />
          <span class="text-xs text-muted-foreground">Visitors</span>
        </div>
        <WickChart class="relative aspect-auto h-[280px]">
          <PieSeries :data="browsers" :options="pieOptions" />
          <PieTooltip />
        </WickChart>
      </div>
    </CardContent>
  </Card>
</template>
