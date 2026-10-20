import { type ReactNode, useEffect, useMemo, useState } from 'react';

import {
  BarSeries,
  ChartContainer,
  type ChartTheme,
  Crosshair,
  Title,
  Tooltip,
  XAxis,
  type XPointInput,
  YAxis,
} from '@wick-charts/react';

const REGIONS = ['Europe', 'Asia', 'Americas', 'Africa', 'Oceania'];
// One update every 1.5 s — well past the 250 ms value ease, so the bars settle between updates.
const UPDATE_MS = 1500;

// Revenue per region, $M — one layer per year.
const REVENUE = [
  { label: '2023', values: [42, 35, 28, 12, 8] },
  { label: '2024', values: [46, 41, 27, 15, 9] },
  { label: '2025', values: [49, 47, 25, 19, 11] },
];

// Margin change per region, percentage points — signed, so some bars grow down from zero.
const MARGIN = [
  { label: '2024', values: [3, 5, -4, 2, -1] },
  { label: '2025', values: [2, 6, -6, 4, 1] },
];

type Layer = { label: string; data: XPointInput[] };

function toLayers(base: { label: string; values: number[] }[], regions = REGIONS): Layer[] {
  return base.map(({ label, values }) => ({
    label,
    data: regions.map((x) => ({ x, value: values[REGIONS.indexOf(x)] })),
  }));
}

// The header sits above the plot (`headerLayout="inline"`), so a value label on the tallest bar never runs into the title.
// Stable outside the components: `axis.x.type` is read once, at construction.
const CATEGORY_AXIS = { x: { type: 'category' as const } };
// Listed names come first, in list order; an unlisted one would follow.
const ORDERED_AXIS = {
  x: { type: 'category' as const, categories: ['Asia', 'Europe', 'Americas', 'Africa', 'Oceania'] },
};

const REVENUE_LAYERS = toLayers(REVENUE);
const MARGIN_LAYERS = toLayers(MARGIN);

// Grouped: the layers of one series stand side by side in each band, with their values on top.
function GroupedRevenue({ theme }: { theme: ChartTheme }) {
  return (
    <ChartContainer theme={theme} axis={ORDERED_AXIS} headerLayout="inline" style={{ minHeight: 0 }}>
      <Title sub="$M per year, Asia first">Grouped</Title>
      <BarSeries data={REVENUE_LAYERS} options={{ valueLabels: true }} />
      <XAxis />
      <YAxis />
      <Crosshair />
      <Tooltip />
    </ChartContainer>
  );
}

// 100%: each column splits into the layers' shares of its total.
function RevenueMix({ theme }: { theme: ChartTheme }) {
  return (
    <ChartContainer theme={theme} axis={CATEGORY_AXIS} headerLayout="inline" style={{ minHeight: 0 }}>
      <Title sub="share of each region's revenue">100% stacked</Title>
      <BarSeries data={REVENUE_LAYERS} options={{ stacking: 'percent' }} />
      <XAxis />
      <YAxis format={(value) => `${value}%`} />
      <Crosshair />
      <Tooltip />
    </ChartContainer>
  );
}

// Signed values: a negative bar grows down from zero and its label hangs below it.
function MarginChange({ theme }: { theme: ChartTheme }) {
  return (
    <ChartContainer theme={theme} axis={CATEGORY_AXIS} headerLayout="inline" style={{ minHeight: 0 }}>
      <Title sub="pts vs. prior year">Negative values</Title>
      <BarSeries data={MARGIN_LAYERS} options={{ valueLabels: true }} />
      <XAxis />
      <YAxis />
      <Crosshair />
      <Tooltip />
    </ChartContainer>
  );
}

// Live: Americas leaves the data for two updates out of four and comes back.
// It fades out in its band, the later bands slide over, and it fades back in.
function ComeAndGo({ theme }: { theme: ChartTheme }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      // A hidden tab throttles timers, then fires a burst on return.
      if (document.hidden) return;

      setTick((t) => t + 1);
    }, UPDATE_MS);

    return () => window.clearInterval(id);
  }, []);

  const layers = useMemo(() => {
    const away = tick % 4 >= 2;
    const regions = away ? REGIONS.filter((region) => region !== 'Americas') : REGIONS;

    return toLayers(REVENUE, regions);
  }, [tick]);

  return (
    <ChartContainer theme={theme} axis={CATEGORY_AXIS} headerLayout="inline" style={{ minHeight: 0 }}>
      <Title sub="Americas comes and goes">Live</Title>
      <BarSeries data={layers} />
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

export function CategoryBarsDemo({ theme }: { theme: ChartTheme }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', height: '100%' }}>
      <ChartCard theme={theme}>
        <GroupedRevenue theme={theme} />
      </ChartCard>
      <ChartCard theme={theme}>
        <RevenueMix theme={theme} />
      </ChartCard>
      <ChartCard theme={theme}>
        <MarginChange theme={theme} />
      </ChartCard>
      <ChartCard theme={theme}>
        <ComeAndGo theme={theme} />
      </ChartCard>
    </div>
  );
}
