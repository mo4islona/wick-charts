<script setup lang="ts">
import {
  type PieSliceData,
  RadialProgressSeries,
  startLabels,
} from "@wick-charts/vue"
import { onBeforeUnmount, onMounted, shallowRef } from "vue"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { WickChart } from "@/components/ui/wick-chart"

const TICK_MS = 2000

const initialUsage: PieSliceData[] = [
  { label: "Seats", value: 83 },
  { label: "API calls", value: 64 },
  { label: "Storage", value: 41 },
]

const radialOptions = { endAngle: 270, labels: startLabels() }

// Demo feed: usage grows a little every tick and starts over at the limit.
function addUsage(items: PieSliceData[]): PieSliceData[] {
  return items.map((item) => {
    const value = item.value + Math.random() * 1.5

    return { ...item, value: value > 100 ? 20 : value }
  })
}

const usage = shallowRef(initialUsage)

let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  timer = setInterval(() => {
    usage.value = addUsage(usage.value)
  }, TICK_MS)
})

onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Plan usage</CardTitle>
      <CardDescription
        >Share of the Pro plan limits, this month</CardDescription
      >
    </CardHeader>
    <CardContent>
      <WickChart class="aspect-auto h-[260px]">
        <RadialProgressSeries :data="usage" :options="radialOptions" />
      </WickChart>
    </CardContent>
  </Card>
</template>
