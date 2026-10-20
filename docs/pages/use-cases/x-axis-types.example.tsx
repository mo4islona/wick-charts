import { type ReactNode, useEffect, useState } from 'react';

import {
  ChartContainer,
  type ChartTheme,
  Crosshair,
  LineSeries,
  Title,
  Tooltip,
  XAxis,
  type XPointInput,
  YAxis,
} from '@wick-charts/react';

// Throughput (req/s) at each concurrency level — the steps double, then widen.
const THROUGHPUT: XPointInput[] = [
  { x: 1, value: 120 },
  { x: 2, value: 230 },
  { x: 4, value: 420 },
  { x: 8, value: 690 },
  { x: 16, value: 940 },
  { x: 32, value: 1150 },
  { x: 48, value: 1210 },
  { x: 64, value: 1235 },
];

type Fix = { x: number; value: number };

// Fixes kept on screen — older ones roll off the left edge.
const WINDOW = 80;

// Stable outside the components: `axis.x.type` is read once, at construction.
const NUMERIC_AXIS = { x: { type: 'numeric' as const } };

// Rolling hills along the route, with a little GPS noise.
function elevation(km: number): number {
  return Math.round(260 + 120 * Math.sin(km / 2.5) + 35 * Math.sin(km * 1.9) + Math.random() * 6);
}

// GPS fixes land at uneven distances, so `x` grows by an irregular step.
function nextFix(last: Fix): Fix {
  const x = Math.round((last.x + 0.05 + Math.random() * 0.2) * 100) / 100;

  return { x, value: elevation(x) };
}

function seedRide(): Fix[] {
  const ride: Fix[] = [{ x: 0, value: elevation(0) }];
  for (let i = 1; i < 40; i++) {
    ride.push(nextFix(ride[i - 1]));
  }

  return ride;
}

// Static: irregular steps along X, each drawn at its own `x`.
function LoadTest({ theme }: { theme: ChartTheme }) {
  return (
    <ChartContainer theme={theme} axis={NUMERIC_AXIS} padding={{ left: 12, right: 12 }} style={{ minHeight: 0 }}>
      <Title sub="concurrency → req/s">Load test</Title>
      <LineSeries
        data={[{ label: 'Throughput', data: THROUGHPUT }]}
        options={{ points: { visible: true }, area: { visible: false } }}
      />
      <XAxis minLabelSpacing={40} />
      <YAxis />
      <Crosshair />
      <Tooltip />
    </ChartContainer>
  );
}

// Live: streams like time. Each new, larger `x` is appended with its entrance
// animation, and `slice` rolls the window while auto-scroll follows.
function LiveRide({ theme }: { theme: ChartTheme }) {
  const [ride, setRide] = useState(seedRide);

  useEffect(() => {
    const id = window.setInterval(() => {
      // A hidden tab throttles timers, then fires a burst on return.
      if (document.hidden) return;

      setRide((prev) => [...prev, nextFix(prev[prev.length - 1])].slice(-WINDOW));
    }, 500);

    return () => window.clearInterval(id);
  }, []);

  return (
    <ChartContainer theme={theme} axis={NUMERIC_AXIS} style={{ minHeight: 0 }}>
      <Title sub="distance, km → elevation, m">Live ride</Title>
      <LineSeries data={[{ label: 'Elevation', data: ride }]} />
      <XAxis format={(x) => `${Number(x).toFixed(1)} km`} minLabelSpacing={56} />
      <YAxis />
      <Crosshair />
      <Tooltip />
    </ChartContainer>
  );
}

// A bordered card per chart separates the stacked panes.
function ChartCard({ theme, children }: { theme: ChartTheme; children: ReactNode }) {
  return (
    <div
      style={{
        flex: 1,
        // ChartContainer's 240px floor would push the lower card out of a short stack.
        minHeight: 0,
        borderRadius: 8,
        overflow: 'hidden',
        border: `1px solid ${theme.tooltip.borderColor}`,
      }}
    >
      {children}
    </div>
  );
}

export function XAxisTypesDemo({ theme }: { theme: ChartTheme }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', height: '100%' }}>
      <ChartCard theme={theme}>
        <LoadTest theme={theme} />
      </ChartCard>
      <ChartCard theme={theme}>
        <LiveRide theme={theme} />
      </ChartCard>
    </div>
  );
}
