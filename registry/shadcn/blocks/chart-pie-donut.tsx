'use client';

import { useEffect, useState } from 'react';

import { NumberFlow, PieSeries, type PieSliceData, PieTooltip } from '@wick-charts/react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WickChart } from '@/components/ui/wick-chart';

const TICK_MS = 2000;

const initialBrowsers: PieSliceData[] = [
  { label: 'Chrome', value: 275 },
  { label: 'Safari', value: 200 },
  { label: 'Firefox', value: 187 },
  { label: 'Edge', value: 173 },
  { label: 'Other', value: 90 },
];

// Demo feed: a few new visits land on random browsers every tick.
function addVisits(slices: PieSliceData[]): PieSliceData[] {
  return slices.map((slice) => ({ ...slice, value: slice.value + Math.round(Math.random() * 6) }));
}

export function ChartPieDonut() {
  const [browsers, setBrowsers] = useState(initialBrowsers);

  useEffect(() => {
    const timer = setInterval(() => setBrowsers(addVisits), TICK_MS);

    return () => clearInterval(timer);
  }, []);

  const total = browsers.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <Card>
      <CardHeader className="items-center text-center">
        <CardTitle>Visitors by browser</CardTitle>
        <CardDescription>Today, live</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Under the chart, so the tooltip stays on top; the donut hole is transparent. */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <NumberFlow value={total} className="text-3xl font-bold tabular-nums" />
            <span className="text-xs text-muted-foreground">Visitors</span>
          </div>
          <WickChart className="relative aspect-auto h-[280px]">
            <PieSeries data={browsers} options={{ innerRadiusRatio: 0.62, sliceLabels: { mode: 'none' } }} />
            <PieTooltip />
          </WickChart>
        </div>
      </CardContent>
    </Card>
  );
}
