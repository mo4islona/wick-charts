<script setup lang="ts">
import {
  Crosshair,
  LineSeries,
  Navigator,
  TimeAxis,
  type TimePoint,
  Tooltip,
  YAxis,
} from "@wick-charts/vue"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { WickChart } from "@/components/ui/wick-chart"

const DAY_MS = 86_400_000
const DAYS = 365

const formatUsd = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD" })

const viewport = { initialRange: 90 }
const lineOptions = { pulse: false }

// Seeded, so the server render and the browser show the same close.
function seededRandom(seed: number): () => number {
  let state = seed

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296

    return state / 4_294_967_296
  }
}

// Demo data: a year of daily closes. Replace with your own series.
function makePrices(): TimePoint[] {
  const random = seededRandom(17)
  const start = Math.floor(Date.now() / DAY_MS) * DAY_MS - DAYS * DAY_MS
  const points: TimePoint[] = []
  let price = 180

  for (let day = 0; day < DAYS; day++) {
    price = Math.max(20, price * (1 + (random() - 0.48) * 0.04))
    points.push({ time: start + day * DAY_MS, value: price })
  }

  return points
}

const prices = makePrices()
const series = { label: "ACME", data: prices }
const navigatorData = { type: "line" as const, points: prices }
const latest = prices[prices.length - 1]?.value ?? 0
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>ACME</CardTitle>
      <CardDescription
        >Daily close, drag the window below to move through the
        year</CardDescription
      >
      <CardAction class="text-right">
        <div class="text-2xl font-semibold tabular-nums">
          {{ formatUsd(latest) }}
        </div>
        <div class="text-xs text-muted-foreground">last close</div>
      </CardAction>
    </CardHeader>
    <CardContent>
      <WickChart class="aspect-auto h-[320px]" :viewport="viewport">
        <LineSeries :data="series" :options="lineOptions" />
        <YAxis :format="formatUsd" />
        <TimeAxis />
        <Crosshair />
        <Tooltip :format="formatUsd" />
        <Navigator :data="navigatorData" :height="48" />
      </WickChart>
    </CardContent>
  </Card>
</template>
