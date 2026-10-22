<script setup lang="ts">
import { BarSeries, Legend, Tooltip, XAxis, YAxis } from '@wick-charts/vue';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { WickChart } from '@/components/ui/wick-chart';

const visitors = [
  { month: 'January', desktop: 186, mobile: 80 },
  { month: 'February', desktop: 305, mobile: 200 },
  { month: 'March', desktop: 237, mobile: 120 },
  { month: 'April', desktop: 73, mobile: 190 },
  { month: 'May', desktop: 209, mobile: 130 },
  { month: 'June', desktop: 214, mobile: 140 },
];

const formatCount = (value: number) => value.toLocaleString('en-US');

const axis = { x: { type: 'category' as const } };
const barOptions = { stacking: 'off' as const };

const layers = [
  { label: 'Desktop', data: visitors.map((row) => ({ x: row.month.slice(0, 3), value: row.desktop })) },
  { label: 'Mobile', data: visitors.map((row) => ({ x: row.month.slice(0, 3), value: row.mobile })) },
];
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Visitors</CardTitle>
      <CardDescription>January - June 2026</CardDescription>
    </CardHeader>
    <CardContent>
      <WickChart class="aspect-auto h-[280px]" :axis="axis">
        <BarSeries :data="layers" :options="barOptions" />
        <XAxis />
        <YAxis />
        <Tooltip :format="formatCount" />
        <Legend />
      </WickChart>
    </CardContent>
    <CardFooter class="text-sm text-muted-foreground">Desktop leads in five of six months.</CardFooter>
  </Card>
</template>
