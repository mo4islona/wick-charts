import { useEffect, useState } from 'react';

import {
  ChartContainer,
  type ChartTheme,
  type HeatmapCellData,
  HeatmapSeries,
  type HeatmapSeriesOptions,
  HeatmapTooltip,
  Title,
  mixColors,
  perfHud,
  resolveCandlestickBodyColor,
} from '@wick-charts/react';

import { Cell } from '../components/Cell';
import type { ChartCodeConfig, PropValue } from '../components/CodePreview';
import { ICONS } from '../components/playground/icons';
import { Playground, type PlaygroundCard, type PlaygroundChartProps } from '../components/playground/Playground';
import { Slider, Toggle } from '../components/playground/primitives';
import type { RowSpec, SectionSpec } from '../components/playground/sections';

interface HeatmapSettings {
  tooltipVisible: boolean;
  axisLabels: boolean;
  cellLabels: boolean;
  live: boolean;
  gap: number;
  cornerRadius: number;
  entryMs: number;
  updateMs: number;
}

// Deterministic PRNG (mulberry32) so every load and both SSR/CSR passes
// paint the same datasets.
function mulberry32(seed: number): () => number {
  let a = seed;

  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// GitHub-style contribution wall: bursty weekday activity, quiet weekends.
function genActivity(): HeatmapCellData[] {
  const rand = mulberry32(7);
  const data: HeatmapCellData[] = [];
  for (let week = 1; week <= 16; week++) {
    for (const day of WEEKDAYS) {
      const weekend = day === 'Sat' || day === 'Sun';
      const base = weekend ? 2 : 10;
      const burst = rand() < 0.18 ? rand() * 26 : 0;
      data.push({ x: `W${week}`, y: day, value: Math.round(base * rand() + burst) });
    }
  }

  return data;
}

const ASSETS = ['BTC', 'ETH', 'SOL', 'AVAX', 'DOT', 'LINK'];

// Symmetric correlation matrix in [-1, 1] — the diverging-ramp showcase.
function genCorrelation(): HeatmapCellData[] {
  const rand = mulberry32(21);
  const matrix = new Map<string, number>();
  for (let i = 0; i < ASSETS.length; i++) {
    for (let j = i; j < ASSETS.length; j++) {
      const value = i === j ? 1 : Math.round((rand() * 1.6 - 0.6) * 100) / 100;
      matrix.set(`${i}:${j}`, value);
      matrix.set(`${j}:${i}`, value);
    }
  }

  const data: HeatmapCellData[] = [];
  for (let i = 0; i < ASSETS.length; i++) {
    for (let j = 0; j < ASSETS.length; j++) {
      const value = matrix.get(`${i}:${j}`);
      if (value !== undefined) {
        data.push({ x: ASSETS[j], y: ASSETS[i], value });
      }
    }
  }

  return data;
}

// Diurnal traffic wave: 24 columns stress the column-label thinning.
function genTraffic(): HeatmapCellData[] {
  const rand = mulberry32(42);
  const data: HeatmapCellData[] = [];
  for (const day of WEEKDAYS) {
    const weekend = day === 'Sat' || day === 'Sun';
    for (let hour = 0; hour < 24; hour++) {
      const diurnal = Math.exp(-((hour - 14) ** 2) / 26);
      const scale = weekend ? 40 : 100;
      data.push({ x: `${hour}h`, y: day, value: Math.round(scale * diurnal * (0.7 + 0.6 * rand())) });
    }
  }

  return data;
}

const SERVICES = ['api', 'auth', 'feed', 'search', 'billing'];
const REGIONS = ['us-east', 'us-west', 'eu-west', 'ap-south'];

// Latency board — regenerated per tick when Live is on, same grid shape, so
// the renderer's in-place value tween carries the motion.
function genLatency(tick: number): HeatmapCellData[] {
  const rand = mulberry32(1000 + tick);
  const data: HeatmapCellData[] = [];
  for (const service of SERVICES) {
    for (const region of REGIONS) {
      const base = 40 + 60 * rand();
      const spike = rand() < 0.12 ? 180 * rand() : 0;
      data.push({ x: region, y: service, value: Math.round(base + spike) });
    }
  }

  return data;
}

type CardId = 'activity' | 'correlation' | 'traffic' | 'latency';

interface HeatmapCard {
  title: string;
  sub: string;
  /** This card's own options, as the Code tab prints them. */
  code?: Record<string, PropValue>;
}

const CARDS: Record<CardId, HeatmapCard> = {
  activity: { title: 'Contributions', sub: '16 weeks' },
  correlation: { title: 'Correlation', sub: '90d returns', code: { colors: 'divergingColors', min: -1, max: 1 } },
  traffic: { title: 'Traffic', sub: 'req/s by hour' },
  latency: { title: 'Latency', sub: 'p95 ms', code: { cellLabels: true } },
};

const ACTIVITY = genActivity();
const CORRELATION = genCorrelation();
const TRAFFIC = genTraffic();

type HeatmapChartProps = PlaygroundChartProps &
  HeatmapSettings & {
    data: HeatmapCellData[];
    title: string;
    sub: string;
    seriesOptions?: Partial<HeatmapSeriesOptions>;
  };

function HeatmapChart({
  theme,
  gradient,
  perfHudVisible,
  data,
  title,
  sub,
  seriesOptions,
  tooltipVisible,
  axisLabels,
  cellLabels,
  gap,
  cornerRadius,
  entryMs,
  updateMs,
}: HeatmapChartProps) {
  const sid = 'heatmap';

  return (
    <ChartContainer
      theme={theme}
      axis={{ y: { visible: false, width: 0 }, x: { visible: false, height: 0 } }}
      gradient={gradient}
      grid={{ visible: false }}
      perf={perfHudVisible ? perfHud() : undefined}
    >
      <Title sub={sub}>{title}</Title>
      <HeatmapSeries
        id={sid}
        data={data}
        options={{
          gap,
          cornerRadius,
          axisLabels,
          cellLabels,
          entryMs,
          updateMs,
          ...seriesOptions,
        }}
      />
      {tooltipVisible && <HeatmapTooltip seriesId={sid} />}
    </ChartContainer>
  );
}

// Live cell: swaps in a fresh same-shape dataset on an interval so the
// per-cell value tween (updateMs) does the storytelling.
function LiveLatencyChart(props: PlaygroundChartProps & HeatmapSettings) {
  const [data, setData] = useState(() => genLatency(0));

  useEffect(() => {
    if (!props.live) return;

    let tick = 0;
    const timer = setInterval(() => {
      tick += 1;
      setData(genLatency(tick));
    }, 1200);

    return () => clearInterval(timer);
  }, [props.live]);

  return (
    <HeatmapChart
      {...props}
      data={data}
      title={CARDS.latency.title}
      sub={CARDS.latency.sub}
      seriesOptions={{ cellLabels: true }}
    />
  );
}

const DISPLAY_EXTRA: SectionSpec = {
  id: 'display-heatmap',
  title: 'Display',
  extend: 'display',
  icon: ICONS.display,
  rows: [
    {
      key: 'tooltipVisible',
      label: 'Tooltip',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'axisLabels',
      label: 'Axis labels',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'cellLabels',
      label: 'Cell values',
      hint: 'When it fits',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
  ] as RowSpec[],
};

const DEMO_EXTRA: SectionSpec = {
  id: 'demo-heatmap',
  title: 'Demo',
  extend: 'demo',
  rows: [
    {
      key: 'live',
      label: 'Live updates',
      hint: 'Latency card only',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
  ] as RowSpec[],
};

const GEOMETRY_SECTION: SectionSpec = {
  id: 'geometry-heatmap',
  title: 'Geometry',
  icon: ICONS.display,
  rows: [
    {
      key: 'gap',
      label: 'Cell gap',
      render: (v, onChange) => (
        <Slider value={v as number} min={0} max={8} step={0.5} suffix="px" onChange={onChange as (v: number) => void} />
      ),
    },
    {
      key: 'cornerRadius',
      label: 'Corner radius',
      render: (v, onChange) => (
        <Slider value={v as number} min={0} max={12} step={1} suffix="px" onChange={onChange as (v: number) => void} />
      ),
    },
  ] as RowSpec[],
};

const MOTION_SECTION: SectionSpec = {
  id: 'motion-heatmap',
  title: 'Animation',
  icon: ICONS.display,
  rows: [
    {
      key: 'entryMs',
      label: 'Entrance',
      hint: 'Diagonal wave · 0 = off',
      render: (v, onChange) => (
        <Slider
          value={v as number}
          min={0}
          max={1500}
          step={50}
          suffix="ms"
          onChange={onChange as (v: number) => void}
        />
      ),
    },
    {
      key: 'updateMs',
      label: 'Value tween',
      hint: 'Glide to new values · 0 snaps',
      render: (v, onChange) => (
        <Slider
          value={v as number}
          min={0}
          max={1000}
          step={50}
          suffix="ms"
          onChange={onChange as (v: number) => void}
        />
      ),
    },
  ] as RowSpec[],
};

// The library's own defaults: the Code tab prints an option only when it differs.
const DEFAULTS = { gap: 2, cornerRadius: 3, entryMs: 600, updateMs: 300 };

function heatmapCode(s: PlaygroundChartProps & HeatmapSettings, card: HeatmapCard): ChartCodeConfig {
  const options: Record<string, PropValue> = {};
  if (s.gap !== DEFAULTS.gap) options.gap = s.gap;
  if (s.cornerRadius !== DEFAULTS.cornerRadius) options.cornerRadius = s.cornerRadius;
  if (!s.axisLabels) options.axisLabels = false;
  if (s.cellLabels) options.cellLabels = true;
  if (s.entryMs !== DEFAULTS.entryMs) options.entryMs = s.entryMs;
  if (s.updateMs !== DEFAULTS.updateMs) options.updateMs = s.updateMs;
  Object.assign(options, card.code);

  return {
    title: { text: card.title, sub: card.sub },
    theme: 'catppuccin.theme',
    containerProps: s.gradient ? { gradient: true } : undefined,
    components: [
      { component: 'HeatmapSeries', props: { data: 'data', ...(Object.keys(options).length > 0 ? { options } : {}) } },
      ...(s.tooltipVisible ? [{ component: 'HeatmapTooltip' }] : []),
    ],
  };
}

export function HeatmapPage({ theme }: { theme: ChartTheme }) {
  // Diverging ramp for the correlation cell: theme's down color → a neutral
  // step just off the surface → theme's up color.
  const downColor = resolveCandlestickBodyColor(theme.candlestick.down.body);
  const upColor = resolveCandlestickBodyColor(theme.candlestick.up.body);
  const divergingColors = [downColor, mixColors(theme.background, theme.axis.textColor, 0.15), upColor];

  return (
    <Playground<HeatmapSettings>
      id="heatmap"
      theme={theme}
      extraDefaults={{
        tooltipVisible: true,
        axisLabels: true,
        cellLabels: false,
        live: true,
        gap: 2,
        cornerRadius: 3,
        entryMs: 600,
        updateMs: 300,
      }}
      gridTemplate="1fr 1fr"
      gridColumns="1fr 1fr"
      hideCartesian
      // Heatmap motion is driven by the per-series entryMs / updateMs rows in
      // the Animation section below — suppress the built-in per-kind sliders.
      animationKinds={[]}
      sections={[DEMO_EXTRA, DISPLAY_EXTRA, GEOMETRY_SECTION, MOTION_SECTION]}
      charts={(props) => (
        <>
          <Cell theme={props.theme} cardId="activity">
            <HeatmapChart
              key={`activity-${props.perfHudVisible}-${props.entryMs}`}
              {...props}
              data={ACTIVITY}
              title={CARDS.activity.title}
              sub={CARDS.activity.sub}
            />
          </Cell>
          <Cell theme={props.theme} cardId="correlation">
            <HeatmapChart
              key={`correlation-${props.perfHudVisible}-${props.entryMs}`}
              {...props}
              data={CORRELATION}
              title={CARDS.correlation.title}
              sub={CARDS.correlation.sub}
              seriesOptions={{ colors: divergingColors, min: -1, max: 1, cellLabels: props.cellLabels }}
            />
          </Cell>
          <Cell theme={props.theme} cardId="traffic">
            <HeatmapChart
              key={`traffic-${props.perfHudVisible}-${props.entryMs}`}
              {...props}
              data={TRAFFIC}
              title={CARDS.traffic.title}
              sub={CARDS.traffic.sub}
            />
          </Cell>
          <Cell theme={props.theme} cardId="latency">
            <LiveLatencyChart key={`latency-${props.perfHudVisible}`} {...props} />
          </Cell>
        </>
      )}
      cards={(s): PlaygroundCard[] =>
        (Object.keys(CARDS) as CardId[]).map((id) => ({
          id,
          title: CARDS[id].title,
          sub: CARDS[id].sub,
          code: heatmapCode(s, CARDS[id]),
        }))
      }
    />
  );
}
