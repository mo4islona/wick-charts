"use client"

import { useEffect, useState } from "react"

import { GaugeSeries } from "@wick-charts/react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { WickChart } from "@/components/ui/wick-chart"

const TICK_MS = 1000

const formatPercent = (value: number) => `${Math.round(value)}%`

const gaugeOptions = {
  label: "CPU load",
  format: formatPercent,
  zones: [{ to: 60 }, { to: 85 }, { to: 100 }],
}

// Demo feed: replace with your own metric.
function nextLoad(previous: number): number {
  const drift = (58 - previous) * 0.1
  const load = previous + drift + (Math.random() - 0.5) * 14

  return Math.min(100, Math.max(0, load))
}

export function ChartGauge() {
  const [load, setLoad] = useState(58)

  useEffect(() => {
    const timer = setInterval(() => setLoad(nextLoad), TICK_MS)

    return () => clearInterval(timer)
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Server load</CardTitle>
        <CardDescription>api-1, updated every second</CardDescription>
      </CardHeader>
      <CardContent>
        <WickChart className="aspect-auto h-[240px]">
          <GaugeSeries value={load} options={gaugeOptions} />
        </WickChart>
      </CardContent>
    </Card>
  )
}
