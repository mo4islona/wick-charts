"use client"

import {
  type HeatmapCellData,
  HeatmapSeries,
  HeatmapTooltip,
} from "@wick-charts/react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { WickChart } from "@/components/ui/wick-chart"

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const HOURS = Array.from({ length: 24 }, (_, hour) =>
  String(hour).padStart(2, "0")
)

const formatCount = (value: number) => Math.round(value).toLocaleString("en-US")

const heatmapOptions = { rows: WEEKDAYS, columns: HOURS }

// Seeded, so every render shows the same picture.
function seededRandom(seed: number): () => number {
  let state = seed

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296

    return state / 4_294_967_296
  }
}

// Demo data: a work-hours peak on weekdays and an evening peak at the weekend.
function makeActivity(): HeatmapCellData[] {
  const random = seededRandom(5)
  const cells: HeatmapCellData[] = []

  for (const [day, weekday] of WEEKDAYS.entries()) {
    const weekend = day >= 5

    for (const [hour, label] of HOURS.entries()) {
      const work = Math.exp(-((hour - 14) ** 2) / 18) * (weekend ? 0.35 : 1)
      const evening = Math.exp(-((hour - 21) ** 2) / 6) * (weekend ? 0.8 : 0.4)
      cells.push({
        x: label,
        y: weekday,
        value: Math.round((work + evening) * 100 + random() * 12),
      })
    }
  }

  return cells
}

const activity = makeActivity()

export function ChartHeatmap() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>Sessions by weekday and hour</CardDescription>
      </CardHeader>
      <CardContent>
        <WickChart className="aspect-auto h-[280px]">
          <HeatmapSeries data={activity} options={heatmapOptions} />
          <HeatmapTooltip format={formatCount} />
        </WickChart>
      </CardContent>
    </Card>
  )
}
