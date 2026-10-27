<script setup lang="ts">
import {
  type SankeyLink,
  type SankeyNode,
  SankeySeries,
  SankeyTooltip,
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

const formatCount = (value: number) => Math.round(value).toLocaleString("en-US")

const nodes: SankeyNode[] = [
  { id: "search", label: "Search" },
  { id: "ads", label: "Paid ads" },
  { id: "social", label: "Social" },
  { id: "landing", label: "Landing page" },
  { id: "blog", label: "Blog" },
  { id: "signup", label: "Sign-up" },
  { id: "bounced", label: "Bounced" },
]

const initialLinks: SankeyLink[] = [
  { source: "search", target: "landing", value: 4200 },
  { source: "search", target: "blog", value: 1800 },
  { source: "ads", target: "landing", value: 2600 },
  { source: "social", target: "blog", value: 1500 },
  { source: "social", target: "landing", value: 600 },
  { source: "landing", target: "signup", value: 2400 },
  { source: "landing", target: "bounced", value: 5000 },
  { source: "blog", target: "signup", value: 900 },
  { source: "blog", target: "bounced", value: 2400 },
]

// Demo feed: every flow drifts by up to 5 % a tick.
function driftLinks(links: SankeyLink[]): SankeyLink[] {
  return links.map((link) => ({
    ...link,
    value: link.value * (1 + (Math.random() - 0.5) * 0.1),
  }))
}

const links = shallowRef(initialLinks)

let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  timer = setInterval(() => {
    links.value = driftLinks(links.value)
  }, TICK_MS)
})

onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Visitor flow</CardTitle>
      <CardDescription>From source to sign-up, last 30 days</CardDescription>
    </CardHeader>
    <CardContent>
      <WickChart class="aspect-auto h-[300px]">
        <SankeySeries :nodes="nodes" :links="links" />
        <SankeyTooltip :format="formatCount" />
      </WickChart>
    </CardContent>
  </Card>
</template>
