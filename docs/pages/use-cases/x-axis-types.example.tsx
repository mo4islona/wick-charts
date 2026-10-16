import { type ReactNode, useEffect, useState } from 'react';

import {
  BarSeries,
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

// Monthly active users (millions) per region — one band per category.
const REGIONS: XPointInput[] = [
  { x: 'Europe', value: 42 },
  { x: 'Asia', value: 35 },
  { x: 'Americas', value: 28 },
  { x: 'Africa', value: 12 },
  { x: 'Oceania', value: 8 },
];

type Fix = { x: number; value: number };
type Vote = { x: string; value: number };

// Fixes kept on screen — older ones roll off the left edge.
const WINDOW = 80;
// Languages in the order they first get a vote; Kotlin and Zig arrive as write-ins.
const LANGUAGES = ['TypeScript', 'Python', 'Rust', 'Go', 'Kotlin', 'Zig'];
const WEIGHTS = [6, 5, 3, 3, 1, 0.5];
// Votes before the poll closes and a new one opens.
const POLL_SIZE = 600;

// Stable outside the components: `axis.x.type` is read once, at construction.
const NUMERIC_AXIS = { x: { type: 'numeric' as const } };
const CATEGORY_AXIS = { x: { type: 'category' as const, padding: { inner: 0.3, outer: 0.2 } } };

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

function seedPoll(): Vote[] {
  return [
    { x: 'TypeScript', value: 14 },
    { x: 'Python', value: 11 },
    { x: 'Rust', value: 6 },
    { x: 'Go', value: 5 },
  ];
}

function pickLanguage(): string {
  const total = WEIGHTS.reduce((sum, weight) => sum + weight, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < LANGUAGES.length; i++) {
    roll -= WEIGHTS[i];
    if (roll < 0) return LANGUAGES[i];
  }

  return LANGUAGES[0];
}

// A vote for a language nobody named yet appends it — a new band at the end.
function castVotes(prev: Vote[]): Vote[] {
  const total = prev.reduce((sum, vote) => sum + vote.value, 0);
  if (total >= POLL_SIZE) return seedPoll();

  const next = prev.map((vote) => ({ ...vote }));
  const count = 1 + Math.floor(Math.random() * 5);
  for (let i = 0; i < count; i++) {
    const language = pickLanguage();
    const vote = next.find((v) => v.x === language);
    if (vote) {
      vote.value += 1;
    } else {
      next.push({ x: language, value: 1 });
    }
  }

  return next;
}

// Numeric, static: irregular steps along X, each drawn at its own `x`.
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

// Numeric, live: streams like time. Each new, larger `x` is appended with its
// entrance animation, and `slice` rolls the window while auto-scroll follows.
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

// Category, static: one band per name, in first-seen order.
function RegionUsers({ theme }: { theme: ChartTheme }) {
  return (
    <ChartContainer theme={theme} axis={CATEGORY_AXIS} style={{ minHeight: 0 }}>
      <Title sub="monthly active users, M">Users by region</Title>
      <BarSeries data={[{ label: 'Users', color: '#e8a54b', data: REGIONS }]} />
      <XAxis format={(x) => String(x).toUpperCase()} />
      <YAxis />
      <Crosshair />
      <Tooltip />
    </ChartContainer>
  );
}

// Category, live: any bar can change and eases to its new value; a new name adds a
// band, and the bands refit so every category stays in view.
function LivePoll({ theme }: { theme: ChartTheme }) {
  const [votes, setVotes] = useState(seedPoll);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.hidden) return;

      setVotes(castVotes);
    }, 400);

    return () => window.clearInterval(id);
  }, []);

  return (
    <ChartContainer theme={theme} axis={CATEGORY_AXIS} style={{ minHeight: 0 }}>
      <Title sub="votes per language">Live poll</Title>
      <BarSeries data={[{ label: 'Votes', color: '#6f9ef8', data: votes }]} />
      <XAxis />
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
        // ChartContainer's 240px floor would push the lower cards out of a short stack.
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
      <ChartCard theme={theme}>
        <RegionUsers theme={theme} />
      </ChartCard>
      <ChartCard theme={theme}>
        <LivePoll theme={theme} />
      </ChartCard>
    </div>
  );
}
