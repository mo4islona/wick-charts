"use client"

import { Legend, type RadarLayer, RadarSeries } from "@wick-charts/react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { WickChart } from "@/components/ui/wick-chart"

const axes = ["Reasoning", "Coding", "Math", "Writing", "Vision", "Speed"]

const models: RadarLayer[] = [
  { label: "Atlas", data: [92, 88, 85, 79, 71, 54] },
  { label: "Nova", data: [78, 82, 70, 88, 84, 76] },
]

const radarOptions = { max: 100 }

export function ChartRadar() {
  return (
    <Card>
      <CardHeader className="items-center text-center">
        <CardTitle>Model comparison</CardTitle>
        <CardDescription>Benchmark scores, out of 100</CardDescription>
      </CardHeader>
      <CardContent>
        <WickChart className="aspect-auto h-[300px]">
          <RadarSeries axes={axes} data={models} options={radarOptions} />
          <Legend />
        </WickChart>
      </CardContent>
    </Card>
  )
}
