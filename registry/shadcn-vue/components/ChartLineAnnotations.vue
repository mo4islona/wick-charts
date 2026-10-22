<script setup lang="ts">
import {
  Crosshair,
  LineSeries,
  Marker,
  ReferenceLine,
  TimeAxis,
  type TimePoint,
  TimeRegion,
  Tooltip,
  YAxis,
} from '@wick-charts/vue';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WickChart } from '@/components/ui/wick-chart';

const MINUTE_MS = 60_000;
const POINTS = 120;

const formatPercent = (value: number) => `${value.toFixed(2)}%`;

const axis = { y: { min: 0 } };
const lineOptions = { pulse: false };

// Seeded, so every render shows the same picture.
function seededRandom(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

    return state / 4_294_967_296;
  };
}

// Demo data: a calm error rate, a deploy, then an incident above the SLO.
function makeErrors(): { points: TimePoint[]; deployAt: number; incidentFrom: number; incidentTo: number } {
  const random = seededRandom(11);
  const start = Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS - POINTS * MINUTE_MS;
  const incidentFrom = start + 70 * MINUTE_MS;
  const incidentTo = start + 88 * MINUTE_MS;
  const points: TimePoint[] = [];

  for (let minute = 0; minute < POINTS; minute++) {
    const time = start + minute * MINUTE_MS;
    const isIncident = time >= incidentFrom && time <= incidentTo;
    const value = isIncident ? 1.6 + random() * 1.2 : 0.35 + random() * 0.25;
    points.push({ time, value });
  }

  return { points, deployAt: incidentFrom - 4 * MINUTE_MS, incidentFrom, incidentTo };
}

const errors = makeErrors();
const series = { label: 'Errors', data: errors.points };
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Error rate</CardTitle>
      <CardDescription>5xx share of requests, last 2 hours</CardDescription>
    </CardHeader>
    <CardContent>
      <WickChart class="aspect-auto h-[280px]" :axis="axis">
        <TimeRegion :from="errors.incidentFrom" :to="errors.incidentTo" label="incident" />
        <LineSeries id="errors" :data="series" :options="lineOptions" />
        <ReferenceLine :value="1" label="SLO 1%" />
        <Marker :time="errors.deployAt" seriesId="errors" shape="arrow-down" label="deploy v2.4" />
        <YAxis :format="formatPercent" />
        <TimeAxis />
        <Crosshair />
        <Tooltip :format="formatPercent" />
      </WickChart>
    </CardContent>
  </Card>
</template>
