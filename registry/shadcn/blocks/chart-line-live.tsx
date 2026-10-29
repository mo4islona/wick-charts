"use client"

import { useEffect, useState } from "react"

import {
  Crosshair,
  LineSeries,
  NumberFlow,
  TimeAxis,
  type TimePoint,
  Tooltip,
  YAxis,
} from "@wick-charts/react"

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

// Seeded, so the server render and the browser start from the same values.
function seededRandom(seed: number): () => number {
  let state = seed

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296

    return state / 4_294_967_296
  }
}

// Demo feed: replace with your own stream and keep the array immutable.
function nextPoint(
  previous: TimePoint,
  random: () => number = Math.random
): TimePoint {
  const drift = (1200 - previous.value) * 0.05
  const value = Math.max(0, previous.value + drift + (random() - 0.5) * 120)

  return { time: previous.time + TICK_MS, value }
}

function seedPoints(): TimePoint[] {
  const random = seededRandom(1_200)
  let point: TimePoint = { time: Date.now() - POINTS * TICK_MS, value: 1200 }
  const points = [point]

  while (points.length < POINTS) {
    point = nextPoint(point, random)
    points.push(point)
  }

  return points
}

export function ChartLineLive() {
  const [data, setData] = useState(seedPoints)

  useEffect(() => {
    const timer = setInterval(() => {
      setData((points) => {
        const last = points[points.length - 1]
        if (!last) return points

        return [...points.slice(1), nextPoint(last)]
      })
    }, TICK_MS)

    return () => clearInterval(timer)
  }, [])

  const latest = data[data.length - 1]?.value ?? 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live traffic</CardTitle>
        <CardDescription>Requests per second, last 2 minutes</CardDescription>
        <CardAction className="text-right">
          <NumberFlow
            value={latest}
            format={formatRate}
            className="text-2xl font-semibold tabular-nums"
          />
          <div className="text-xs text-muted-foreground">req/s</div>
        </CardAction>
      </CardHeader>
      <CardContent>
        <WickChart
          className="aspect-auto h-[280px]"
          viewport={{ maxVisibleBars: POINTS }}
        >
          <LineSeries data={{ label: "Requests", data }} />
          <YAxis format={formatRate} />
          <TimeAxis />
          <Crosshair />
          <Tooltip format={formatRate} />
        </WickChart>
      </CardContent>
    </Card>
  )
}
