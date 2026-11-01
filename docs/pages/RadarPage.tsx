import { useEffect, useState } from 'react';

import {
  ChartContainer,
  type ChartTheme,
  Legend,
  type RadarIntroFn,
  type RadarLayer,
  RadarSeries,
  type RadarSeriesOptions,
  RadarTooltip,
  Title,
  perfHud,
  radarCascadeIntro,
  radarGrowIntro,
  radarInflateIntro,
  radarScanIntro,
  radarSpinIntro,
} from '@wick-charts/react';

import { Cell } from '../components/Cell';
import type { ChartCodeConfig, PropValue } from '../components/CodePreview';
import { ICONS } from '../components/playground/icons';
import { Playground, type PlaygroundCard, type PlaygroundChartProps } from '../components/playground/Playground';
import { Slider, Toggle, ToggleGroup } from '../components/playground/primitives';
import type { RowSpec, SectionSpec } from '../components/playground/sections';

type GridShape = 'polygon' | 'circle';
type Intro = 'grow' | 'scan' | 'spin' | 'cascade' | 'inflate';

/** Each intro once, at module scope: the option compares by identity. */
const INTROS: Record<Intro, { fn: RadarIntroFn; code: string; label: string }> = {
  grow: { fn: radarGrowIntro(), code: 'radarGrowIntro()', label: 'Grow' },
  scan: { fn: radarScanIntro(), code: 'radarScanIntro()', label: 'Scan' },
  spin: { fn: radarSpinIntro(), code: 'radarSpinIntro()', label: 'Spin' },
  cascade: { fn: radarCascadeIntro(), code: 'radarCascadeIntro()', label: 'Cascade' },
  inflate: { fn: radarInflateIntro(), code: 'radarInflateIntro()', label: 'Inflate' },
};

interface RadarSettings {
  tooltipVisible: boolean;
  legendVisible: boolean;
  axisLabels: boolean;
  ringLabels: boolean;
  hoverValues: boolean;
  glow: boolean;
  gridShape: GridShape;
  rings: number;
  fillOpacity: number;
  lineWidth: number;
  dotRadius: number;
  intro: Intro;
  entryMs: number;
  updateMs: number;
  /** Live ticks per second. */
  rate: number;
  /** Largest change of a live value per tick, in points. */
  drift: number;
}

/** The library's own defaults — the Code tab shows an option only when it differs. */
const DEFAULTS = {
  gridShape: 'polygon' as GridShape,
  rings: 4,
  fillOpacity: 0.22,
  lineWidth: 2,
  dotRadius: 3,
  entryMs: 1100,
  updateMs: 500,
};

interface Demo {
  id: string;
  title: string;
  sub: string;
  axes: string[];
  series: RadarLayer[];
  /** Fixed scale; the radar picks a round one when absent. */
  max?: number;
  /** The values drift live. */
  live?: boolean;
  /** PRNG seed of the drift. */
  seed: number;
}

const DEMOS: Demo[] = [
  {
    id: 'models',
    title: 'Model comparison',
    sub: 'benchmark scores · 0–100',
    axes: ['Reasoning', 'Coding', 'Math', 'Writing', 'Vision', 'Speed', 'Cost'],
    series: [
      { label: 'Atlas', data: [92, 88, 85, 79, 71, 54, 40] },
      { label: 'Nova', data: [78, 82, 70, 88, 84, 76, 68] },
      { label: 'Orion', data: [61, 58, 64, 70, 52, 95, 92] },
    ],
    max: 100,
    seed: 3,
  },
  {
    id: 'health',
    title: 'Service health',
    sub: 'live · % of budget used',
    axes: ['CPU', 'Memory', 'Disk I/O', 'Network', 'Latency', 'Errors'],
    series: [
      { label: 'eu-west', data: [64, 72, 38, 55, 42, 18] },
      { label: 'us-east', data: [48, 58, 66, 71, 61, 34] },
    ],
    max: 100,
    live: true,
    seed: 19,
  },
  {
    id: 'player',
    title: 'Player profile',
    sub: 'season ratings vs league average',
    axes: ['Pace', 'Shooting', 'Passing', 'Dribbling', 'Defending', 'Physical'],
    series: [
      { label: 'K. Mbeki', data: [91, 84, 76, 89, 38, 72] },
      { label: 'League avg', data: [68, 62, 66, 64, 63, 67] },
    ],
    max: 100,
    seed: 7,
  },
  {
    id: 'laptops',
    title: 'Laptop picks',
    sub: 'review scores · out of 10',
    axes: ['Battery', 'Display', 'Performance', 'Keyboard', 'Weight', 'Price'],
    series: [
      { label: 'Air 13', data: [9.2, 8.1, 6.8, 7.4, 9.5, 7.9] },
      { label: 'Pro 16', data: [7.1, 9.6, 9.8, 8.6, 5.2, 4.8] },
    ],
    max: 10,
    seed: 29,
  },
];

// Deterministic PRNG (mulberry32) so the prerendered and the hydrated first
// frame paint the same values.
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

/** One step of up to `drift` points, pulled back toward `base`, inside 0–100. */
function driftValue(args: { value: number; base: number; drift: number; rand: () => number }): number {
  const { value, base, drift, rand } = args;
  const next = value + (base - value) * 0.15 + (rand() * 2 - 1) * drift;

  return Math.round(Math.min(100, Math.max(0, next)));
}

/** The demo's series, drifting `rate` times a second when the demo is live. */
function useLiveSeries(args: { demo: Demo; rate: number; drift: number }): RadarLayer[] {
  const { demo, rate, drift } = args;
  const [rand] = useState(() => mulberry32(demo.seed));
  const [series, setSeries] = useState(demo.series);

  useEffect(() => {
    if (!demo.live) return;

    const timer = window.setInterval(() => {
      // A hidden tab throttles timers, then fires a burst on return.
      if (document.hidden) return;

      setSeries((previous) =>
        previous.map((layer, l) => ({
          ...layer,
          data: layer.data.map((value, i) =>
            driftValue({ value: value ?? 0, base: demo.series[l].data[i] ?? 0, drift, rand }),
          ),
        })),
      );
    }, 1000 / rate);

    return () => window.clearInterval(timer);
  }, [demo, rand, rate, drift]);

  return series;
}

function seriesOptions(s: RadarSettings, demo: Demo): Partial<RadarSeriesOptions> {
  return {
    max: demo.max,
    rings: s.rings,
    gridShape: s.gridShape,
    fillOpacity: s.fillOpacity,
    lineWidth: s.lineWidth,
    dotRadius: s.dotRadius,
    axisLabels: s.axisLabels,
    ringLabels: s.ringLabels,
    hoverValues: s.hoverValues,
    glow: s.glow,
    introAnimation: INTROS[s.intro].fn,
    entryMs: s.entryMs,
    updateMs: s.updateMs,
  };
}

function RadarChart(props: PlaygroundChartProps & RadarSettings & { demo: Demo }) {
  const { theme, gradient, perfHudVisible, demo, rate, drift, tooltipVisible, legendVisible } = props;
  const series = useLiveSeries({ demo, rate, drift });

  return (
    <ChartContainer
      theme={theme}
      gradient={gradient}
      grid={{ visible: false }}
      perf={perfHudVisible ? perfHud() : undefined}
    >
      <Title sub={demo.sub}>{demo.title}</Title>
      <RadarSeries axes={demo.axes} data={series} options={seriesOptions(props, demo)} />
      {tooltipVisible && <RadarTooltip />}
      {legendVisible && <Legend position="bottom" />}
    </ChartContainer>
  );
}

function toggleRow(row: Omit<RowSpec, 'render'>): RowSpec {
  return {
    ...row,
    render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
  };
}

function sliderRow(
  row: Omit<RowSpec, 'render'> & { range: { min: number; max: number; step: number }; suffix?: string },
): RowSpec {
  const { range, suffix, ...rest } = row;

  return {
    ...rest,
    render: (v, onChange) => (
      <Slider
        value={v as number}
        min={range.min}
        max={range.max}
        step={range.step}
        suffix={suffix}
        onChange={onChange as (v: number) => void}
      />
    ),
  };
}

const DISPLAY_EXTRA: SectionSpec = {
  id: 'display-radar',
  title: 'Display',
  extend: 'display',
  icon: ICONS.display,
  rows: [
    toggleRow({ key: 'tooltipVisible', label: 'Tooltip' }),
    toggleRow({ key: 'legendVisible', label: 'Legend' }),
    toggleRow({ key: 'axisLabels', label: 'Axis names' }),
    toggleRow({ key: 'ringLabels', label: 'Ring values', hint: 'Along the first axis' }),
    toggleRow({ key: 'hoverValues', label: 'Hover values', hint: 'Value by each vertex' }),
  ],
};

const SERIES_SECTION: SectionSpec = {
  id: 'series-radar',
  title: 'Series',
  icon: ICONS.series,
  defaultOpen: true,
  rows: [
    {
      key: 'gridShape',
      label: 'Grid',
      render: (v, onChange) => (
        <ToggleGroup<GridShape>
          value={v as GridShape}
          options={[
            { value: 'polygon', label: 'Polygon' },
            { value: 'circle', label: 'Circle' },
          ]}
          onChange={onChange as (v: GridShape) => void}
        />
      ),
    },
    sliderRow({ key: 'rings', label: 'Rings', range: { min: 2, max: 8, step: 1 } }),
    sliderRow({ key: 'fillOpacity', label: 'Fill', range: { min: 0, max: 0.6, step: 0.02 } }),
    sliderRow({ key: 'lineWidth', label: 'Outline', range: { min: 0, max: 4, step: 0.5 }, suffix: 'px' }),
    sliderRow({ key: 'dotRadius', label: 'Dots', range: { min: 0, max: 6, step: 0.5 }, suffix: 'px' }),
    toggleRow({ key: 'glow', label: 'Hover glow' }),
  ],
};

const MOTION_SECTION: SectionSpec = {
  id: 'motion-radar',
  title: 'Animation',
  icon: ICONS.display,
  rows: [
    {
      key: 'intro',
      label: 'Intro',
      render: (v, onChange) => (
        <ToggleGroup<Intro>
          value={v as Intro}
          options={(Object.keys(INTROS) as Intro[]).map((value) => ({ value, label: INTROS[value].label }))}
          onChange={onChange as (v: Intro) => void}
        />
      ),
    },
    sliderRow({
      key: 'entryMs',
      label: 'Entrance',
      hint: 'First paint · 0 = off',
      range: { min: 0, max: 3000, step: 50 },
      suffix: 'ms',
    }),
    sliderRow({
      key: 'updateMs',
      label: 'Morph',
      hint: 'Glide to new data · 0 snaps',
      range: { min: 0, max: 1500, step: 50 },
      suffix: 'ms',
    }),
  ],
};

// The simulated drift of the live card — demo controls, not chart options.
const DEMO_EXTRA: SectionSpec = {
  id: 'demo-radar',
  title: 'Demo',
  extend: 'demo',
  rows: [
    sliderRow({
      key: 'rate',
      label: 'Updates',
      hint: 'Service health card',
      range: { min: 1, max: 10, step: 1 },
      suffix: '/s',
    }),
    sliderRow({ key: 'drift', label: 'Drift', hint: 'Largest step per update', range: { min: 0, max: 20, step: 1 } }),
  ],
};

const SECTIONS = [DEMO_EXTRA, DISPLAY_EXTRA, SERIES_SECTION, MOTION_SECTION];

/** The options the Code tab prints: only what differs from the library defaults. */
function codeOptions(s: RadarSettings, demo: Demo): Record<string, PropValue> {
  const options: Record<string, PropValue> = {};
  if (demo.max !== undefined) options.max = demo.max;
  if (s.gridShape !== DEFAULTS.gridShape) options.gridShape = s.gridShape;
  if (s.rings !== DEFAULTS.rings) options.rings = s.rings;
  if (s.fillOpacity !== DEFAULTS.fillOpacity) options.fillOpacity = s.fillOpacity;
  if (s.lineWidth !== DEFAULTS.lineWidth) options.lineWidth = s.lineWidth;
  if (s.dotRadius !== DEFAULTS.dotRadius) options.dotRadius = s.dotRadius;
  if (!s.axisLabels) options.axisLabels = false;
  if (!s.ringLabels) options.ringLabels = false;
  if (!s.hoverValues) options.hoverValues = false;
  if (!s.glow) options.glow = false;
  if (s.intro !== 'grow') options.introAnimation = INTROS[s.intro].code;
  if (s.entryMs !== DEFAULTS.entryMs) options.entryMs = s.entryMs;
  if (s.updateMs !== DEFAULTS.updateMs) options.updateMs = s.updateMs;

  return options;
}

function radarCode(s: PlaygroundChartProps & RadarSettings, demo: Demo): ChartCodeConfig {
  const containerProps: Record<string, PropValue> = { grid: { visible: false } };
  if (s.gradient) containerProps.gradient = true;

  const options = codeOptions(s, demo);

  return {
    title: { text: demo.title, sub: demo.sub },
    theme: 'catppuccin.theme',
    containerProps,
    components: [
      {
        component: 'RadarSeries',
        props: { axes: 'axes', data: 'series', ...(Object.keys(options).length > 0 ? { options } : {}) },
      },
      ...(s.tooltipVisible ? [{ component: 'RadarTooltip', props: {} }] : []),
      ...(s.legendVisible ? [{ component: 'Legend', props: { position: 'bottom' } }] : []),
    ],
  };
}

export function RadarPage({ theme }: { theme: ChartTheme }) {
  return (
    <Playground<RadarSettings>
      id="radar"
      theme={theme}
      extraDefaults={{
        tooltipVisible: true,
        legendVisible: true,
        axisLabels: true,
        ringLabels: true,
        hoverValues: true,
        glow: true,
        gridShape: DEFAULTS.gridShape,
        rings: DEFAULTS.rings,
        fillOpacity: DEFAULTS.fillOpacity,
        lineWidth: DEFAULTS.lineWidth,
        dotRadius: DEFAULTS.dotRadius,
        intro: 'grow',
        entryMs: DEFAULTS.entryMs,
        updateMs: DEFAULTS.updateMs,
        rate: 3,
        drift: 6,
      }}
      gridTemplate="1fr 1fr"
      gridColumns="1fr 1fr"
      mobileRowHeight={400}
      hideCartesian
      // Radar motion is driven by the per-series entryMs / updateMs rows in the Animation section.
      animationKinds={[]}
      sections={SECTIONS}
      charts={(props) =>
        DEMOS.map((demo) => (
          <Cell key={demo.id} theme={props.theme} cardId={demo.id}>
            <RadarChart
              key={`${demo.id}-${props.perfHudVisible}-${props.entryMs}-${props.intro}`}
              {...props}
              demo={demo}
            />
          </Cell>
        ))
      }
      cards={(s): PlaygroundCard[] =>
        DEMOS.map((demo) => ({ id: demo.id, title: demo.title, sub: demo.sub, code: radarCode(s, demo) }))
      }
    />
  );
}
