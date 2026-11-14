<script setup lang="ts">
import { HistogramSeries, Tooltip, XAxis, YAxis } from "@wick-charts/vue"
import { onBeforeUnmount, onMounted, shallowRef } from "vue"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { WickChart } from "@/components/ui/wick-chart"

const WINDOW = 2000
const BATCH = 40
const TICK_MS = 1000

// Read once, when the chart mounts.
const axis = { x: { type: "numeric" as const } }

const histogramOptions = { binWidth: 20, quantiles: [0.5, 0.95] }

// Seeded, so the server render and the browser start from the same values.
function seededRandom(seed: number): () => number {
  let state = seed

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296

    return state / 4_294_967_296
  }
}

// Demo feed: replace with your own response times, in ms.
function responseTimes(count: number, random: () => number = Math.random) {
  return Array.from({ length: count }, () => {
    const normal =
      Math.sqrt(-2 * Math.log(Math.max(random(), 1e-9))) *
      Math.cos(2 * Math.PI * random())

    return Math.round(120 * Math.exp(0.45 * normal))
  })
}

const samples = shallowRef(responseTimes(WINDOW, seededRandom(42)))

let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  timer = setInterval(() => {
    samples.value = [...samples.value.slice(BATCH), ...responseTimes(BATCH)]
  }, TICK_MS)
})

onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Response times</CardTitle>
      <CardDescription>Last 2,000 requests, ms</CardDescription>
    </CardHeader>
    <CardContent>
      <WickChart :axis="axis" class="aspect-auto h-[250px]">
        <HistogramSeries :data="samples" :options="histogramOptions" />
        <Tooltip />
        <YAxis />
        <XAxis />
      </WickChart>
    </CardContent>
  </Card>
</template>
