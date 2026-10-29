<script setup lang="ts">
import {
  BandSeries,
  Crosshair,
  LineSeries,
  NumberFlow,
  TimeAxis,
  Tooltip,
  YAxis,
} from "@wick-charts/vue"
import { computed, onBeforeUnmount, onMounted, shallowRef } from "vue"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { WickChart } from "@/components/ui/wick-chart"

const POINTS = 90
const TICK_MS = 1000

const formatMs = (value: number) => `${Math.round(value)} ms`

const viewport = { maxVisibleBars: POINTS }
const medianOptions = { area: { visible: false } }

interface LatencyRow {
  time: number
  p5: number
  p25: number
  p50: number
  p75: number
  p95: number
}

// Seeded, so the server render and the browser start from the same values.
function seededRandom(seed: number): () => number {
  let state = seed

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296

    return state / 4_294_967_296
  }
}

// Demo feed: replace with your own percentiles, one row a second.
function nextRow(
  previous: LatencyRow,
  random: () => number = Math.random
): LatencyRow {
  const p50 = previous.p50 + (120 - previous.p50) * 0.08 + (random() - 0.5) * 14
  const spread = 18 + random() * 10

  return {
    time: previous.time + TICK_MS,
    p5: p50 - spread * 1.6,
    p25: p50 - spread * 0.6,
    p50,
    p75: p50 + spread * 0.8,
    p95: p50 + spread * 2.6 + random() * 30,
  }
}

function seedRows(): LatencyRow[] {
  const random = seededRandom(120)
  let row: LatencyRow = {
    time: Date.now() - POINTS * TICK_MS,
    p5: 90,
    p25: 110,
    p50: 120,
    p75: 135,
    p95: 180,
  }
  const rows = [row]

  while (rows.length < POINTS) {
    row = nextRow(row, random)
    rows.push(row)
  }

  return rows
}

const rows = shallowRef(seedRows())
const bands = computed(() => [
  {
    label: "p5–p95",
    data: rows.value.map((row) => ({
      time: row.time,
      low: row.p5,
      high: row.p95,
    })),
  },
  {
    label: "p25–p75",
    data: rows.value.map((row) => ({
      time: row.time,
      low: row.p25,
      high: row.p75,
    })),
  },
])
const median = computed(() => ({
  label: "p50",
  data: rows.value.map((row) => ({ time: row.time, value: row.p50 })),
}))
const latest = computed(() => rows.value[rows.value.length - 1]?.p50 ?? 0)

let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  timer = setInterval(() => {
    const previous = rows.value
    const last = previous[previous.length - 1]
    if (!last) return

    rows.value = [...previous.slice(1), nextRow(last)]
  }, TICK_MS)
})

onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>API latency</CardTitle>
      <CardDescription>Median with p25–p75 and p5–p95 bands</CardDescription>
      <CardAction class="text-right">
        <NumberFlow
          :value="latest"
          :format="formatMs"
          class="text-2xl font-semibold tabular-nums"
        />
        <div class="text-xs text-muted-foreground">p50</div>
      </CardAction>
    </CardHeader>
    <CardContent>
      <WickChart class="aspect-auto h-[280px]" :viewport="viewport">
        <!-- Bands first, so the median draws over them. -->
        <BandSeries :data="bands" />
        <LineSeries :data="median" :options="medianOptions" />
        <YAxis :format="formatMs" />
        <TimeAxis />
        <Crosshair />
        <Tooltip :format="formatMs" />
      </WickChart>
    </CardContent>
  </Card>
</template>
