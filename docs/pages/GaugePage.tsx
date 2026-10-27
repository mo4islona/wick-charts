import { useEffect, useState } from 'react';

import {
  ChartContainer,
  type ChartTheme,
  GaugeSeries,
  type GaugeSeriesOptions,
  type GaugeZone,
  PieLegend,
  type PieSliceInput,
  RadialProgressSeries,
  type RadialProgressSeriesOptions,
  type RingPainter,
  Title,
  flyTicks,
  heroCenter,
  heroLayout,
  listCenter,
  mixColors,
  perfHud,
  radarTicks,
  sampleRamp,
  startLabels,
  tickRing,
} from '@wick-charts/react';

import { Cell } from '../components/Cell';
import type { ChartCodeConfig, PropValue } from '../components/CodePreview';
import { ICONS } from '../components/playground/icons';
import { Playground, type PlaygroundChartProps } from '../components/playground/Playground';
import { Slider, Toggle, ToggleGroup } from '../components/playground/primitives';
import type { RowSpec, SectionSpec } from '../components/playground/sections';

type GaugeStyle = 'arc' | 'needle';
type ZonePalette = 'theme' | 'custom';
type ZoneColor = 'target' | 'morph';
type ValueColor = 'theme' | 'amber';
type TrackColor = 'theme' | 'custom';
type RingColors = 'theme' | 'accent';
type TickPreset = 'pop' | 'radar' | 'fly';

interface GaugeSettings {
  style: GaugeStyle;
  startAngle: number;
  /** `endAngle - startAngle`, so the end never comes before the start. */
  sweep: number;
  zones: boolean;
  zonePalette: ZonePalette;
  zoneColor: ZoneColor;
  caption: boolean;
  valueColor: ValueColor;
  trackColor: TrackColor;
  rangeLabels: boolean;
  ringMax: number;
  ringColors: RingColors;
  ringTrack: TrackColor;
  tickAnimation: TickPreset;
  legendVisible: boolean;
  entryMs: number;
  updateMs: number;
  /** Live ticks per second. */
  rate: number;
  /** Largest change of a live value per tick, in percent of its range. */
  drift: number;
}

/** The library's own defaults — the Code tab shows an option only when it differs. */
const DEFAULTS = {
  max: 100,
  startAngle: -120,
  endAngle: 120,
  sweep: 240,
  entryMs: 900,
  updateMs: 500,
};

/** Cool → hot, for the "custom" zone colors. */
const CUSTOM_ZONE_COLORS = ['#4dabf7', '#9775fa', '#f06595'];
const AMBER = '#f5a524';
const CUSTOM_TRACK = 'rgba(128, 128, 128, 0.18)';

const formatPercent = (value: number) => `${value}%`;

interface GaugeDemo {
  id: string;
  title: string;
  sub: string;
  caption: string;
  min: number;
  max: number;
  /** Where the live value drifts around. */
  base: number;
  /** Upper bound of each zone, low to high. */
  zoneBounds: number[];
  /** Zones run bad → good (a budget left), so the colors flip. */
  badToGood: boolean;
  format: (value: number) => string;
  seed: number;
  /** Variable names in the Code tab: the value, and its formatter. */
  code: { value: string; format: string };
}

const GAUGES: GaugeDemo[] = [
  {
    id: 'cpu',
    title: 'CPU load',
    sub: 'api-1',
    caption: 'used',
    min: 0,
    max: 100,
    base: 62,
    zoneBounds: [60, 85, 100],
    badToGood: false,
    format: formatPercent,
    seed: 7,
    code: { value: 'cpuLoad', format: 'formatPercent' },
  },
  {
    id: 'latency',
    title: 'Latency p95',
    sub: 'checkout API',
    caption: 'p95',
    min: 0,
    max: 500,
    base: 212,
    zoneBounds: [200, 350, 500],
    badToGood: false,
    format: (value) => `${value} ms`,
    seed: 13,
    code: { value: 'latencyP95', format: 'formatMs' },
  },
  {
    id: 'budget',
    title: 'Error budget',
    sub: 'this month',
    caption: 'left',
    min: 0,
    max: 100,
    base: 38,
    zoneBounds: [20, 50, 100],
    badToGood: true,
    format: formatPercent,
    seed: 29,
    code: { value: 'errorBudget', format: 'formatPercent' },
  },
];

const TICK_ANIMATIONS = { pop: undefined, radar: radarTicks, fly: flyTicks };

function ticks(s: GaugeSettings): RingPainter {
  const animation = TICK_ANIMATIONS[s.tickAnimation];

  return tickRing({ animation: animation?.() });
}

function ticksCode(s: GaugeSettings): string {
  return s.tickAnimation === 'pop' ? 'tickRing()' : `tickRing({ animation: ${s.tickAnimation}Ticks() })`;
}

interface RadialDemo {
  id: string;
  title: string;
  sub: string;
  rings: PieSliceInput[];
  seed: number;
  /** The data's variable name in the Code tab. */
  ref: string;
  /** The arc and the functions that give this card its look. */
  look: (s: GaugeSettings) => Partial<RadialProgressSeriesOptions>;
  /** {@link look} as it reads in the Code tab. */
  lookCode: (s: GaugeSettings) => Record<string, PropValue>;
}

const RADIALS: RadialDemo[] = [
  {
    id: 'cluster',
    title: 'Cluster',
    sub: 'share of capacity',
    rings: [
      { label: 'CPU', value: 72 },
      { label: 'Memory', value: 54 },
      { label: 'Disk', value: 31 },
    ],
    seed: 23,
    ref: 'clusterUsage',
    look: (s) => ({ layout: heroLayout(), painter: ticks(s), labels: heroCenter() }),
    lookCode: (s) => ({ layout: 'heroLayout()', painter: ticksCode(s), labels: 'heroCenter()' }),
  },
  {
    id: 'plan',
    title: 'Plan usage',
    sub: 'this billing cycle',
    rings: [
      { label: 'Seats', value: 83 },
      { label: 'API calls', value: 64 },
      { label: 'Storage', value: 41 },
    ],
    seed: 31,
    ref: 'planUsage',
    look: () => ({ startAngle: -90, endAngle: 90, labels: listCenter() }),
    lookCode: () => ({ startAngle: -90, endAngle: 90, labels: 'listCenter()' }),
  },
  {
    id: 'release',
    title: 'Release 2.4',
    sub: 'done per track',
    rings: [
      { label: 'Features', value: 78 },
      { label: 'Fixes', value: 56 },
      { label: 'Docs', value: 34 },
    ],
    seed: 37,
    ref: 'releaseProgress',
    look: () => ({ endAngle: 270, labels: startLabels() }),
    lookCode: () => ({ endAngle: 270, labels: 'startLabels()' }),
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

/** One step of up to `step`, pulled back toward `base`, kept within `min`…`max`. */
function driftValue(args: {
  value: number;
  base: number;
  range: { min: number; max: number; step: number };
  rand: () => number;
}): number {
  const { value, base, range, rand } = args;
  const noise = (rand() * 2 - 1) * range.step;
  const next = value + (base - value) * 0.2 + noise;

  return Math.min(range.max, Math.max(range.min, Math.round(next)));
}

/** `bases` with every value drifting `rate` times a second by up to `drift` percent of the range. */
function useDrift(args: {
  bases: number[];
  seed: number;
  rate: number;
  drift: number;
  bounds: { min: number; max: number };
}): number[] {
  const { bases, seed, rate, drift, bounds } = args;
  const [rand] = useState(() => mulberry32(seed));
  const [values, setValues] = useState(bases);
  const { min, max } = bounds;

  useEffect(() => {
    const range = { min, max, step: ((max - min) * drift) / 100 };
    const timer = window.setInterval(() => {
      // A hidden tab throttles timers, then fires a burst on return.
      if (document.hidden) return;

      setValues((previous) => previous.map((value, i) => driftValue({ value, base: bases[i], range, rand })));
    }, 1000 / rate);

    return () => window.clearInterval(timer);
  }, [bases, rand, rate, drift, min, max]);

  return values;
}

function zonesOf(args: { demo: GaugeDemo; colors: ZonePalette; theme: ChartTheme }): GaugeZone[] {
  const { demo, colors, theme } = args;
  const ramp = colors === 'custom' ? CUSTOM_ZONE_COLORS : (theme.gauge?.zoneColors ?? []);
  const ordered = demo.badToGood ? [...ramp].reverse() : ramp;
  // Good → bad on the theme ramp is the library default: those zones need no color.
  const defaultColors = colors === 'theme' && !demo.badToGood;

  const last = demo.zoneBounds.length - 1;

  // Sampled like the library does: a one-hue theme has a two-stop ramp.
  return demo.zoneBounds.map((to, i) => (defaultColors ? { to } : { to, color: sampleRamp(ordered, i / last) }));
}

function gaugeOptions(args: { s: GaugeSettings; demo: GaugeDemo; theme: ChartTheme }): Partial<GaugeSeriesOptions> {
  const { s, demo, theme } = args;

  return {
    style: s.style,
    min: demo.min,
    max: demo.max,
    startAngle: s.startAngle,
    endAngle: s.startAngle + s.sweep,
    zones: s.zones ? zonesOf({ demo, colors: s.zonePalette, theme }) : undefined,
    zoneColor: s.zoneColor,
    label: s.caption ? demo.caption : undefined,
    format: demo.format,
    color: s.valueColor === 'amber' ? AMBER : undefined,
    trackColor: s.trackColor === 'custom' ? CUSTOM_TRACK : undefined,
    rangeLabels: s.rangeLabels,
    entryMs: s.entryMs,
    updateMs: s.updateMs,
  };
}

/** Shades of the theme accent, one per ring, from full to faded toward the background. */
function accentColors(args: { theme: ChartTheme; count: number }): string[] {
  const { theme, count } = args;
  const step = count > 1 ? 0.6 / (count - 1) : 0;

  return Array.from({ length: count }, (_, i) => mixColors(theme.line.color, theme.background, i * step));
}

function radialOptions(args: {
  s: GaugeSettings;
  demo: RadialDemo;
  theme: ChartTheme;
}): Partial<RadialProgressSeriesOptions> {
  const { s, demo, theme } = args;

  return {
    max: s.ringMax,
    colors: s.ringColors === 'accent' ? accentColors({ theme, count: demo.rings.length }) : undefined,
    trackColor: s.ringTrack === 'custom' ? CUSTOM_TRACK : undefined,
    ...demo.look(s),
    entryMs: s.entryMs,
    updateMs: s.updateMs,
  };
}

const PERCENT_BOUNDS = { min: 0, max: 100 };

function GaugeChart(props: PlaygroundChartProps & GaugeSettings & { demo: GaugeDemo }) {
  const { theme, gradient, perfHudVisible, rate, drift, demo } = props;
  const [bases] = useState(() => [demo.base]);
  const [value] = useDrift({ bases, seed: demo.seed, rate, drift, bounds: demo });

  return (
    <ChartContainer
      theme={theme}
      gradient={gradient}
      grid={{ visible: false }}
      perf={perfHudVisible ? perfHud() : undefined}
    >
      <Title sub={demo.sub}>{demo.title}</Title>
      <GaugeSeries value={value} options={gaugeOptions({ s: props, demo, theme })} />
    </ChartContainer>
  );
}

function RadialChart(props: PlaygroundChartProps & GaugeSettings & { demo: RadialDemo }) {
  const { theme, gradient, perfHudVisible, rate, drift, legendVisible, demo } = props;
  const [bases] = useState(() => demo.rings.map((ring) => ring.value ?? 0));
  const values = useDrift({ bases, seed: demo.seed, rate, drift, bounds: PERCENT_BOUNDS });
  const data = demo.rings.map((ring, i) => ({ ...ring, value: values[i] }));

  return (
    <ChartContainer
      theme={theme}
      gradient={gradient}
      grid={{ visible: false }}
      perf={perfHudVisible ? perfHud() : undefined}
    >
      <Title sub={demo.sub}>{demo.title}</Title>
      <RadialProgressSeries data={data} options={radialOptions({ s: props, demo, theme })} />
      {legendVisible && <PieLegend position="bottom" mode="percent" />}
    </ChartContainer>
  );
}

const toggleRow = (row: Omit<RowSpec, 'render'>): RowSpec => ({
  ...row,
  render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
});

function choiceRow<V extends string>(
  row: Omit<RowSpec, 'render'> & { options: { value: V; label: string }[] },
): RowSpec {
  const { options, ...rest } = row;

  return {
    ...rest,
    render: (v, onChange) => <ToggleGroup<V> value={v as V} options={options} onChange={onChange as (v: V) => void} />,
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

const THEME_OR_GRAY = [
  { value: 'theme' as const, label: 'Theme' },
  { value: 'custom' as const, label: 'Gray' },
];

const GAUGE_SECTION: SectionSpec = {
  id: 'series-gauge',
  title: 'Gauge',
  icon: ICONS.series,
  defaultOpen: true,
  rows: [
    choiceRow<GaugeStyle>({
      key: 'style',
      label: 'Style',
      options: [
        { value: 'arc', label: 'Arc' },
        { value: 'needle', label: 'Needle' },
      ],
    }),
    sliderRow({
      key: 'startAngle',
      label: 'Start angle',
      hint: 'Clockwise from 12 o’clock',
      range: { min: -180, max: 180, step: 10 },
      suffix: '°',
    }),
    sliderRow({
      key: 'sweep',
      label: 'Sweep',
      hint: 'Arc length',
      range: { min: 90, max: 360, step: 10 },
      suffix: '°',
    }),
    toggleRow({ key: 'zones', label: 'Zones', hint: 'Good, warning and bad bands' }),
    {
      ...choiceRow<ZonePalette>({
        key: 'zonePalette',
        label: 'Zone colors',
        options: [
          { value: 'theme', label: 'Theme' },
          { value: 'custom', label: 'Custom' },
        ],
      }),
      visible: (s) => s.zones === true,
    },
    {
      ...choiceRow<ZoneColor>({
        key: 'zoneColor',
        label: 'Value color',
        hint: 'Target zone, or morph on the way',
        options: [
          { value: 'target', label: 'Target' },
          { value: 'morph', label: 'Morph' },
        ],
      }),
      visible: (s) => s.zones === true,
    },
    {
      // Zones cover each demo's whole range, so `color` only shows without them.
      ...choiceRow<ValueColor>({
        key: 'valueColor',
        label: 'Color',
        hint: 'Value arc and needle',
        options: [
          { value: 'theme', label: 'Theme' },
          { value: 'amber', label: 'Amber' },
        ],
      }),
      visible: (s) => s.zones === false,
    },
    choiceRow<TrackColor>({
      key: 'trackColor',
      label: 'Track',
      hint: 'Unfilled part of the arc',
      options: THEME_OR_GRAY,
    }),
    toggleRow({ key: 'caption', label: 'Caption' }),
    toggleRow({ key: 'rangeLabels', label: 'Range labels' }),
  ],
};

const RADIAL_SECTION: SectionSpec = {
  id: 'series-radial-progress',
  title: 'Radial progress',
  icon: ICONS.series,
  defaultOpen: true,
  rows: [
    sliderRow({ key: 'ringMax', label: 'Max', hint: 'Value of a full ring', range: { min: 50, max: 200, step: 10 } }),
    choiceRow<RingColors>({
      key: 'ringColors',
      label: 'Colors',
      options: [
        { value: 'theme', label: 'Theme' },
        { value: 'accent', label: 'Accent' },
      ],
    }),
    choiceRow<TrackColor>({
      key: 'ringTrack',
      label: 'Track',
      hint: 'Unfilled part of each ring',
      options: THEME_OR_GRAY,
    }),
    choiceRow<TickPreset>({
      key: 'tickAnimation',
      label: 'Tick animation',
      hint: 'Cluster card only',
      options: [
        { value: 'pop', label: 'Pop' },
        { value: 'radar', label: 'Radar' },
        { value: 'fly', label: 'Fly' },
      ],
    }),
    toggleRow({ key: 'legendVisible', label: 'Legend' }),
  ],
};

const MOTION_SECTION: SectionSpec = {
  id: 'motion-gauge',
  title: 'Animation',
  icon: ICONS.display,
  rows: [
    sliderRow({
      key: 'entryMs',
      label: 'Entry',
      hint: 'First sweep from min · 0 = off',
      range: { min: 0, max: 3000, step: 50 },
      suffix: 'ms',
    }),
    sliderRow({
      key: 'updateMs',
      label: 'Update',
      hint: 'Glide to a new value · 0 snaps',
      range: { min: 0, max: 1500, step: 50 },
      suffix: 'ms',
    }),
  ],
};

const DEMO_EXTRA: SectionSpec = {
  id: 'demo-gauge',
  title: 'Demo',
  extend: 'demo',
  rows: [
    sliderRow({
      key: 'rate',
      label: 'Updates',
      range: { min: 1, max: 10, step: 1 },
      suffix: '/s',
    }),
    sliderRow({
      key: 'drift',
      label: 'Drift',
      hint: 'Largest step, % of the range',
      range: { min: 0, max: 20, step: 1 },
      suffix: '%',
    }),
  ],
};

const SECTIONS = [DEMO_EXTRA, GAUGE_SECTION, RADIAL_SECTION, MOTION_SECTION];

function containerCode(s: PlaygroundChartProps): Record<string, PropValue> {
  const containerProps: Record<string, PropValue> = { grid: { visible: false } };
  if (s.gradient) containerProps.gradient = true;

  return containerProps;
}

/** `options` plus the motion durations that differ from the library defaults, or `undefined` when empty. */
function withMotion(options: Record<string, PropValue>, s: GaugeSettings): Record<string, PropValue> | undefined {
  const merged = { ...options };
  if (s.entryMs !== DEFAULTS.entryMs) merged.entryMs = s.entryMs;
  if (s.updateMs !== DEFAULTS.updateMs) merged.updateMs = s.updateMs;

  return Object.keys(merged).length > 0 ? merged : undefined;
}

/** One gauge card; the shared controls set the same options on every card. */
function gaugeCode(args: { s: PlaygroundChartProps & GaugeSettings; demo: GaugeDemo }): ChartCodeConfig {
  const { s, demo } = args;
  const options: Record<string, PropValue> = {};
  if (s.style !== 'arc') options.style = s.style;
  if (demo.min !== 0) options.min = demo.min;
  if (demo.max !== DEFAULTS.max) options.max = demo.max;
  const endAngle = s.startAngle + s.sweep;
  if (s.startAngle !== DEFAULTS.startAngle) options.startAngle = s.startAngle;
  if (endAngle !== DEFAULTS.endAngle) options.endAngle = endAngle;
  if (s.zones) options.zones = zonesOf({ demo, colors: s.zonePalette, theme: s.theme }).map((zone) => ({ ...zone }));
  if (s.zones && s.zoneColor !== 'target') options.zoneColor = s.zoneColor;
  if (s.caption) options.label = demo.caption;
  options.format = demo.code.format;
  if (s.valueColor === 'amber') options.color = AMBER;
  if (s.trackColor === 'custom') options.trackColor = CUSTOM_TRACK;
  if (!s.rangeLabels) options.rangeLabels = false;

  return {
    title: { text: demo.title, sub: demo.sub },
    theme: 'catppuccin.theme',
    containerProps: containerCode(s),
    components: [{ component: 'GaugeSeries', props: { value: demo.code.value, options: withMotion(options, s) } }],
  };
}

/** One radial progress card, with its own look. */
function radialCode(args: { s: PlaygroundChartProps & GaugeSettings; demo: RadialDemo }): ChartCodeConfig {
  const { s, demo } = args;
  const options: Record<string, PropValue> = {};
  if (s.ringMax !== DEFAULTS.max) options.max = s.ringMax;
  if (s.ringColors === 'accent') options.colors = 'accentColors';
  if (s.ringTrack === 'custom') options.trackColor = CUSTOM_TRACK;
  Object.assign(options, demo.lookCode(s));

  return {
    title: { text: demo.title, sub: demo.sub },
    theme: 'catppuccin.theme',
    containerProps: containerCode(s),
    components: [
      { component: 'RadialProgressSeries', props: { data: demo.ref, options: withMotion(options, s) } },
      ...(s.legendVisible ? [{ component: 'PieLegend', props: { position: 'bottom', mode: 'percent' } }] : []),
    ],
  };
}

export function GaugePage({ theme }: { theme: ChartTheme }) {
  return (
    <Playground<GaugeSettings>
      id="gauge"
      theme={theme}
      extraDefaults={{
        style: 'arc',
        startAngle: DEFAULTS.startAngle,
        sweep: DEFAULTS.sweep,
        zones: true,
        zonePalette: 'theme',
        zoneColor: 'target',
        caption: true,
        valueColor: 'theme',
        trackColor: 'theme',
        rangeLabels: true,
        ringMax: DEFAULTS.max,
        ringColors: 'theme',
        ringTrack: 'theme',
        tickAnimation: 'pop',
        legendVisible: false,
        entryMs: DEFAULTS.entryMs,
        updateMs: DEFAULTS.updateMs,
        rate: 1,
        drift: 4,
      }}
      gridTemplate="1fr 1fr 1fr"
      gridColumns="1fr 1fr"
      mobileRowHeight={340}
      hideCartesian
      // Motion is driven by the entryMs / updateMs rows in the Animation section below.
      animationKinds={[]}
      sections={SECTIONS}
      charts={(props) => (
        <>
          {GAUGES.map((demo) => (
            <Cell key={demo.id} theme={props.theme} cardId={demo.id}>
              <GaugeChart key={`${demo.id}-${props.perfHudVisible}-${props.entryMs}`} {...props} demo={demo} />
            </Cell>
          ))}
          {RADIALS.map((demo) => (
            <Cell key={demo.id} theme={props.theme} cardId={demo.id}>
              <RadialChart key={`${demo.id}-${props.perfHudVisible}-${props.entryMs}`} {...props} demo={demo} />
            </Cell>
          ))}
        </>
      )}
      cards={(s) => [
        ...GAUGES.map((demo) => ({ id: demo.id, title: demo.title, sub: demo.sub, code: gaugeCode({ s, demo }) })),
        ...RADIALS.map((demo) => ({ id: demo.id, title: demo.title, sub: demo.sub, code: radialCode({ s, demo }) })),
      ]}
    />
  );
}
