<script setup lang="ts">
import {
  Crosshair,
  type DepthLevel,
  DepthSeries,
  NumberFlow,
  Tooltip,
  XAxis,
  YAxis,
  formatSignificant,
} from "@wick-charts/vue"
import { onBeforeUnmount, onMounted, shallowRef } from "vue"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { WickChart } from "@/components/ui/wick-chart"

const LEVELS = 40
const TICK_SIZE = 0.5
const TICK_MS = 1000

interface Book {
  mid: number
  bids: DepthLevel[]
  asks: DepthLevel[]
}

// The mid price format; change it for your market. Below 1, `formatSignificant` keeps
// the digits a small price needs (0.0₆95), as the library default does.
const formatPrice = (value: number) =>
  Math.abs(value) < 1
    ? formatSignificant(value)
    : value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })

const axis = { x: { type: "numeric" as const }, y: { min: 0 } }

// Seeded, so the server render and the browser start from the same book.
function seededRandom(seed: number): () => number {
  let state = seed

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296

    return state / 4_294_967_296
  }
}

// Demo feed: the mid drifts and every level gets a fresh size each tick.
function levelSize(distance: number, random: () => number): number {
  return (0.4 + distance * 0.08) * (0.5 + random())
}

function makeBook(mid: number, random: () => number = Math.random): Book {
  const bids: DepthLevel[] = []
  const asks: DepthLevel[] = []

  for (let i = 1; i <= LEVELS; i++) {
    bids.push([mid - i * TICK_SIZE, levelSize(i, random)])
    asks.push([mid + i * TICK_SIZE, levelSize(i, random)])
  }

  return { mid, bids, asks }
}

function nextBook(book: Book): Book {
  const step = Math.round((Math.random() - 0.5) * 2) * TICK_SIZE

  return makeBook(book.mid + step)
}

const book = shallowRef(makeBook(3_450, seededRandom(3_450)))

let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  timer = setInterval(() => {
    book.value = nextBook(book.value)
  }, TICK_MS)
})

onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>ETH / USD order book</CardTitle>
      <CardDescription
        >Cumulative depth, {{ LEVELS }} levels a side</CardDescription
      >
      <CardAction class="text-right">
        <NumberFlow
          :value="book.mid"
          :format="formatPrice"
          class="text-2xl font-semibold tabular-nums"
        />
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
