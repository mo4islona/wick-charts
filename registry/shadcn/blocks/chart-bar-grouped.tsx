"use client"

import { BarSeries, Legend, Tooltip, XAxis, YAxis } from "@wick-charts/react"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { WickChart } from "@/components/ui/wick-chart"

const visitors = [
  { month: "January", desktop: 186, mobile: 80 },
  { month: "February", desktop: 305, mobile: 200 },
  { month: "March", desktop: 237, mobile: 120 },
  { month: "April", desktop: 73, mobile: 190 },
  { month: "May", desktop: 209, mobile: 130 },
  { month: "June", desktop: 214, mobile: 140 },
]

const formatCount = (value: number) => value.toLocaleString("en-US")

const layers = [
  {
    label: "Desktop",
    data: visitors.map((row) => ({
      x: row.month.slice(0, 3),
      value: row.desktop,
    })),
  },
  {
    label: "Mobile",
    data: visitors.map((row) => ({
      x: row.month.slice(0, 3),
      value: row.mobile,
    })),
  },
]

export function ChartBarGrouped() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Visitors</CardTitle>
        <CardDescription>January - June 2026</CardDescription>
      </CardHeader>
      <CardContent>
        <WickChart
          className="aspect-auto h-[280px]"
          axis={{ x: { type: "category" } }}
        >
          <BarSeries data={layers} options={{ stacking: "off" }} />
          <XAxis />
          <YAxis />
          <Tooltip format={formatCount} />
          <Legend />
        </WickChart>
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        Desktop leads in five of six months.
      </CardFooter>
    </Card>
  )
}
