<script lang="ts">
export interface SparklineMetric {
  label: string
  base: number
  volatility: number
  format: (value: number) => string
  /** `true` when a falling value is the good direction, e.g. latency. */
  lowerIsBetter?: boolean
}
</script>

<script setup lang="ts">
import { LineSeries, NumberFlow, type TimePoint } from "@wick-charts/vue"
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

const props = defineProps<{ metric: SparklineMetric }>()

const POINTS = 40
const TICK_MS = 1500

const axis = {
  y: { visible: false, width: 0 },
  x: { visible: false, height: 0 },
}
const padding = { top: 4, right: 0, bottom: 4, left: 0 }
const grid = { visible: false }
const viewport = { maxVisibleBars: POINTS }
const lineOptions = { pulse: false }

// Seeded, so the server render and the browser start from the same values.
function seededRandom(seed: number): () => number {
  let state = seed

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296

    return state / 4_294_967_296
  }
}

// Demo feed: a random walk pulled back toward the metric's base value.
function nextPoint(
  previous: TimePoint,
  metric: SparklineMetric,
  random: () => number = Math.random
): TimePoint {
  const drift = (metric.base - previous.value) * 0.08
  const noise = (random() - 0.5) * 2 * metric.volatility * metric.base

  return {
    time: previous.time + TICK_MS,
    value: previous.value + drift + noise,
  }
}

function seedPoints(metric: SparklineMetric): TimePoint[] {
  const random = seededRandom(metric.base)
  let point: TimePoint = {
    time: Date.now() - POINTS * TICK_MS,
    value: metric.base,
  }
  const points = [point]

  while (points.length < POINTS) {
    point = nextPoint(point, metric, random)
    points.push(point)
  }

  return points
}

const data = shallowRef(seedPoints(props.metric))
const series = computed(() => ({ label: props.metric.label, data: data.value }))
const latest = computed(() => data.value[data.value.length - 1]?.value ?? 0)
const change = computed(() => {
  const first = data.value[0]?.value ?? 0
  if (first === 0) return 0

  return ((latest.value - first) / first) * 100
})
const isGood = computed(() =>
  props.metric.lowerIsBetter ? change.value <= 0 : change.value >= 0
)
const changeLabel = computed(
  () => `${change.value >= 0 ? "+" : ""}${change.value.toFixed(1)}%`
)

let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  timer = setInterval(() => {
    const points = data.value
    const last = points[points.length - 1]
    if (!last) return

    data.value = [...points.slice(1), nextPoint(last, props.metric)]
  }, TICK_MS)
})

onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <Card class="gap-2 overflow-hidden pb-0">
    <CardHeader>
      <CardDescription>{{ metric.label }}</CardDescription>
      <CardTitle>
        <NumberFlow
          :value="latest"
          :format="metric.format"
          class="text-2xl font-semibold tabular-nums"
        />
      </CardTitle>
      <CardAction
        :class="
          isGood
            ? 'text-xs text-emerald-600 dark:text-emerald-400'
            : 'text-xs text-red-600 dark:text-red-400'
        "
      >
        {{ changeLabel }}
      </CardAction>
    </CardHeader>
    <CardContent class="px-0">
      <WickChart
        class="aspect-auto h-16"
        :axis="axis"
        :padding="padding"
        :grid="grid"
        :interactive="false"
        :viewport="viewport"
      >
        <LineSeries :data="series" :options="lineOptions" />
      </WickChart>
    </CardContent>
  </Card>
</template>
