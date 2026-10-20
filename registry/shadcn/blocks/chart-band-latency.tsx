'use client';

import { useEffect, useMemo, useState } from 'react';

import { BandSeries, Crosshair, LineSeries, NumberFlow, TimeAxis, Tooltip, YAxis } from '@wick-charts/react';

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WickChart } from '@/components/ui/wick-chart';

const POINTS = 90;
const TICK_MS = 1000;

const formatMs = (value: number) => `${Math.round(value)} ms`;

const medianOptions = { area: { visible: false } };

interface LatencyRow {
  time: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

// Demo feed: replace with your own percentiles, one row a second.
function nextRow(previous: LatencyRow): LatencyRow {
  const p50 = previous.p50 + (120 - previous.p50) * 0.08 + (Math.random() - 0.5) * 14;
  const spread = 18 + Math.random() * 10;

  return {
    time: previous.time + TICK_MS,
    p5: p50 - spread * 1.6,
    p25: p50 - spread * 0.6,
    p50,
    p75: p50 + spread * 0.8,
    p95: p50 + spread * 2.6 + Math.random() * 30,
  };
}

function seedRows(): LatencyRow[] {
  const rows: LatencyRow[] = [{ time: Date.now() - POINTS * TICK_MS, p5: 90, p25: 110, p50: 120, p75: 135, p95: 180 }];

  while (rows.length < POINTS) {
    rows.push(nextRow(rows[rows.length - 1]));
  }

  return rows;
}

export function ChartBandLatency() {
  const [rows, setRows] = useState(seedRows);

  useEffect(() => {
    const timer = setInterval(() => {
      setRows((previous) => [...previous.slice(1), nextRow(previous[previous.length - 1])]);
    }, TICK_MS);

    return () => clearInterval(timer);
  }, []);

  const bands = useMemo(
    () => [
      { label: 'p5–p95', data: rows.map((row) => ({ time: row.time, low: row.p5, high: row.p95 })) },
      { label: 'p25–p75', data: rows.map((row) => ({ time: row.time, low: row.p25, high: row.p75 })) },
    ],
    [rows],
  );
  const median = useMemo(() => rows.map((row) => ({ time: row.time, value: row.p50 })), [rows]);
  const latest = rows[rows.length - 1].p50;

  return (
    <Card>
      <CardHeader>
        <CardTitle>API latency</CardTitle>
        <CardDescription>Median with p25–p75 and p5–p95 bands</CardDescription>
        <CardAction className="text-right">
          <NumberFlow value={latest} format={formatMs} className="text-2xl font-semibold tabular-nums" />
          <div className="text-xs text-muted-foreground">p50</div>
        </CardAction>
      </CardHeader>
      <CardContent>
        <WickChart className="aspect-auto h-[280px]" viewport={{ maxVisibleBars: POINTS }}>
          {/* Bands first, so the median draws over them. */}
          <BandSeries data={bands} />
          <LineSeries data={{ label: 'p50', data: median }} options={medianOptions} />
          <YAxis format={formatMs} />
          <TimeAxis />
          <Crosshair />
          <Tooltip format={formatMs} />
        </WickChart>
      </CardContent>
    </Card>
  );
}
