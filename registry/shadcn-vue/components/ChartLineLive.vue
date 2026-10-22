<script setup lang="ts">
import {
  Crosshair,
  LineSeries,
  NumberFlow,
  TimeAxis,
  type TimePoint,
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

const POINTS = 120
const TICK_MS = 1000

const formatRate = (value: number) => Math.round(value).toLocaleString("en-US")

const viewport = { maxVisibleBars: POINTS }

// Demo feed: replace with your own stream and assign a new array on each update.
function nextPoint(previous: TimePoint): TimePoint {
  const drift = (1200 - previous.value) * 0.05
  const value = Math.max(
    0,
    previous.value + drift + (Math.random() - 0.5) * 120
  )

  return { time: previous.time + TICK_MS, value }
}

function seedPoints(): TimePoint[] {
  let point: TimePoint = { time: Date.now() - POINTS * TICK_MS, value: 1200 }
  const points = [point]

  while (points.length < POINTS) {
    point = nextPoint(point)
    points.push(point)
  }

  return points
}

const data = shallowRef(seedPoints())
const series = computed(() => ({ label: "Requests", data: data.value }))
const latest = computed(() => data.value[data.value.length - 1]?.value ?? 0)

let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  timer = setInterval(() => {
    const points = data.value
    const last = points[points.length - 1]
    if (!last) return

    data.value = [...points.slice(1), nextPoint(last)]
  }, TICK_MS)
})

onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Live traffic</CardTitle>
      <CardDescription>Requests per second, last 2 minutes</CardDescription>
      <CardAction class="text-right">
        <NumberFlow
          :value="latest"
          :format="formatRate"
          class="text-2xl font-semibold tabular-nums"
        />
        <div class="text-xs text-muted-foreground">req/s</div>
      </CardAction>
    </CardHeader>
    <CardContent>
      <WickChart class="aspect-auto h-[280px]" :viewport="viewport">
        <LineSeries :data="series" />
        <YAxis :format="formatRate" />
        <TimeAxis />
        <Crosshair />
        <Tooltip :format="formatRate" />
      </WickChart>
    </CardContent>
  </Card>
</template>
