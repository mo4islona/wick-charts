'use client';

import { useEffect, useState } from 'react';

import { LineSeries, NumberFlow, type TimePoint } from '@wick-charts/react';

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WickChart } from '@/components/ui/wick-chart';

const POINTS = 40;
const TICK_MS = 1500;

export interface SparklineMetric {
  label: string;
  base: number;
  volatility: number;
  format: (value: number) => string;
  /** `true` when a falling value is the good direction, e.g. latency. */
  lowerIsBetter?: boolean;
}

const metrics: SparklineMetric[] = [
  {
    label: 'Revenue',
    base: 48_200,
    volatility: 0.01,
    format: (value) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }),
  },
  {
    label: 'Active users',
    base: 2_350,
    volatility: 0.02,
    format: (value) => Math.round(value).toLocaleString('en-US'),
  },
  {
    label: 'p95 latency',
    base: 182,
    volatility: 0.04,
    format: (value) => `${Math.round(value)} ms`,
    lowerIsBetter: true,
  },
];

// Seeded, so the server render and the browser start from the same values.
function seededRandom(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

    return state / 4_294_967_296;
  };
}

// Demo feed: a random walk pulled back toward the metric's base value.
function nextPoint(previous: TimePoint, metric: SparklineMetric, random: () => number = Math.random): TimePoint {
  const drift = (metric.base - previous.value) * 0.08;
  const noise = (random() - 0.5) * 2 * metric.volatility * metric.base;

  return { time: previous.time + TICK_MS, value: previous.value + drift + noise };
}

function seedPoints(metric: SparklineMetric): TimePoint[] {
  const points: TimePoint[] = [{ time: Date.now() - POINTS * TICK_MS, value: metric.base }];
  const random = seededRandom(metric.base);
  while (points.length < POINTS) {
    points.push(nextPoint(points[points.length - 1], metric, random));
  }

  return points;
}

export function SparklineCard({ metric }: { metric: SparklineMetric }) {
  const [data, setData] = useState(() => seedPoints(metric));

  useEffect(() => {
    const timer = setInterval(() => {
      setData((points) => [...points.slice(1), nextPoint(points[points.length - 1], metric)]);
    }, TICK_MS);

    return () => clearInterval(timer);
  }, [metric]);

  const first = data[0].value;
  const latest = data[data.length - 1].value;
  const change = ((latest - first) / first) * 100;
  const isGood = metric.lowerIsBetter ? change <= 0 : change >= 0;

  return (
    <Card className="gap-2 overflow-hidden pb-0">
      <CardHeader>
        <CardDescription>{metric.label}</CardDescription>
        <CardTitle>
          <NumberFlow value={latest} format={metric.format} className="text-2xl font-semibold tabular-nums" />
        </CardTitle>
        <CardAction
          className={
            isGood ? 'text-xs text-emerald-600 dark:text-emerald-400' : 'text-xs text-red-600 dark:text-red-400'
          }
        >
          {change >= 0 ? '+' : ''}
          {change.toFixed(1)}%
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        <WickChart
          className="aspect-auto h-16"
          axis={{ y: { visible: false, width: 0 }, x: { visible: false, height: 0 } }}
          padding={{ top: 4, right: 0, bottom: 4, left: 0 }}
          grid={{ visible: false }}
          interactive={false}
          viewport={{ maxVisibleBars: POINTS }}
        >
          <LineSeries data={{ label: metric.label, data }} options={{ pulse: false }} />
        </WickChart>
      </CardContent>
    </Card>
  );
}

export function ChartSparklineCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {metrics.map((metric) => (
        <SparklineCard key={metric.label} metric={metric} />
      ))}
    </div>
  );
}
