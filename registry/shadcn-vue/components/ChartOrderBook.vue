<script setup lang="ts">
import { Crosshair, type DepthLevel, DepthSeries, NumberFlow, Tooltip, XAxis, YAxis } from '@wick-charts/vue';
import { onBeforeUnmount, onMounted, shallowRef } from 'vue';

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WickChart } from '@/components/ui/wick-chart';

const LEVELS = 40;
const TICK_SIZE = 0.5;
const TICK_MS = 1000;

interface Book {
  mid: number;
  bids: DepthLevel[];
  asks: DepthLevel[];
}

const formatPrice = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const axis = { x: { type: 'numeric' as const }, y: { min: 0 } };

// Demo feed: the mid drifts and every level gets a fresh size each tick.
function levelSize(distance: number): number {
  return (0.4 + distance * 0.08) * (0.5 + Math.random());
}

function makeBook(mid: number): Book {
  const bids: DepthLevel[] = [];
  const asks: DepthLevel[] = [];

  for (let i = 1; i <= LEVELS; i++) {
    bids.push([mid - i * TICK_SIZE, levelSize(i)]);
    asks.push([mid + i * TICK_SIZE, levelSize(i)]);
  }

  return { mid, bids, asks };
}

function nextBook(book: Book): Book {
  const step = Math.round((Math.random() - 0.5) * 2) * TICK_SIZE;

  return makeBook(book.mid + step);
}

const book = shallowRef(makeBook(3_450));

let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  timer = setInterval(() => {
    book.value = nextBook(book.value);
  }, TICK_MS);
});

onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>ETH / USD order book</CardTitle>
      <CardDescription>Cumulative depth, {{ LEVELS }} levels a side</CardDescription>
      <CardAction class="text-right">
        <NumberFlow :value="book.mid" :format="formatPrice" class="text-2xl font-semibold tabular-nums" />
        <div class="text-xs text-muted-foreground">mid</div>
      </CardAction>
    </CardHeader>
    <CardContent>
      <WickChart class="aspect-auto h-[280px]" :axis="axis">
        <DepthSeries :bids="book.bids" :asks="book.asks" />
        <XAxis />
        <YAxis />
        <Crosshair />
        <Tooltip />
      </WickChart>
    </CardContent>
  </Card>
</template>
