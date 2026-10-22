<script setup lang="ts">
import { Crosshair, Legend, LineSeries, TimeAxis, type TimePoint, Tooltip, YAxis } from '@wick-charts/vue';

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WickChart } from '@/components/ui/wick-chart';

const DAY_MS = 86_400_000;
const DAYS = 90;

const formatCount = (value: number) => Math.round(value).toLocaleString('en-US');

const areaOptions = { stacking: 'normal' as const, pulse: false };

// Seeded, so the server render and the browser show the same total.
function seededRandom(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

    return state / 4_294_967_296;
  };
}

// Demo data: daily visitors with a weekly rhythm. Replace with your own series.
function makeVisitors(): { desktop: TimePoint[]; mobile: TimePoint[] } {
  const random = seededRandom(3);
  const start = Math.floor(Date.now() / DAY_MS) * DAY_MS - DAYS * DAY_MS;
  const desktop: TimePoint[] = [];
  const mobile: TimePoint[] = [];

  for (let day = 0; day < DAYS; day++) {
    const time = start + day * DAY_MS;
    const weekly = Math.sin((day / 7) * Math.PI * 2) * 40;
    desktop.push({ time, value: Math.round(220 + weekly + day * 1.2 + random() * 80) });
    mobile.push({ time, value: Math.round(160 - weekly * 0.6 + day * 0.8 + random() * 60) });
  }

  return { desktop, mobile };
}

const visitors = makeVisitors();
// The first layer sits at the bottom of the stack.
const series = [
  { label: 'Mobile', data: visitors.mobile },
  { label: 'Desktop', data: visitors.desktop },
];
const total = series.reduce((sum, layer) => sum + layer.data.reduce((layerSum, point) => layerSum + point.value, 0), 0);
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Visitors</CardTitle>
      <CardDescription>Desktop and mobile, last 3 months</CardDescription>
      <CardAction class="text-right">
        <div class="text-2xl font-semibold tabular-nums">{{ formatCount(total) }}</div>
        <div class="text-xs text-muted-foreground">total</div>
      </CardAction>
    </CardHeader>
    <CardContent>
      <WickChart class="aspect-auto h-[280px]">
        <LineSeries :data="series" :options="areaOptions" />
        <YAxis :format="formatCount" />
        <TimeAxis />
        <Crosshair />
        <Tooltip :format="formatCount" />
        <Legend />
      </WickChart>
    </CardContent>
  </Card>
</template>
