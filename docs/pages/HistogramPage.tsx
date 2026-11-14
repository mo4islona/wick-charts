import { useEffect, useMemo, useState } from 'react';

import {
  type AxisConfig,
  ChartContainer,
  type ChartTheme,
  Crosshair,
  type HistogramData,
  type HistogramNormalize,
  HistogramSeries,
  type HistogramSeriesOptions,
  Legend,
  Title,
  Tooltip,
  XAxis,
  YAxis,
  perfHud,
} from '@wick-charts/react';

import { Cell } from '../components/Cell';
import type { ChartCodeConfig, PropValue } from '../components/CodePreview';
import { ICONS } from '../components/playground/icons';
import { Playground, type PlaygroundCard, type PlaygroundChartProps } from '../components/playground/Playground';
import { Slider, Toggle, ToggleGroup } from '../components/playground/primitives';
import type { RowSpec, SectionSpec } from '../components/playground/sections';

interface HistogramSettings {
  tooltipVisible: boolean;
  crosshairVisible: boolean;
  legendVisible: boolean;
  /** Target bin count; `0` keeps each demo's own binning. */
  bins: number;
  normalize: HistogramNormalize;
  gap: number;
  quantiles: boolean;
  smoothMs: number;
  /** Live updates per second. */
  rate: number;
  /** Samples each live update adds. */
  batch: number;
}

/** The library's own defaults — the Code tab shows an option only when it differs. */
const DEFAULTS = { normalize: 'count' as HistogramNormalize, gap: 1, smoothMs: 600 };

interface Demo {
  id: string;
  title: string;
  sub: string;
  /** The bin width the demo reads best at, until the Bins row overrides it. */
  binWidth?: number;
  quantiles: number[];
  /** Overlaid named layers — the card gets a legend. */
  layered?: boolean;
  /** Samples stream in. */
  live?: boolean;
}

const DEMOS: Demo[] = [
  { id: 'latency', title: 'API latency', sub: 'ms · 4,000 requests', binWidth: 20, quantiles: [0.5, 0.95, 0.99] },
  { id: 'regions', title: 'Latency by region', sub: 'ms · overlaid', binWidth: 20, quantiles: [0.5], layered: true },
  { id: 'orders', title: 'Order sizes', sub: 'live · USD · last 3,000 orders', quantiles: [0.5, 0.9], live: true },
  { id: 'returns', title: 'Daily returns', sub: '% · 10 years', binWidth: 0.5, quantiles: [0.05, 0.95] },
];

/** Live samples kept on screen — a rolling window. */
const LIVE_WINDOW = 3000;

const NUMERIC_AXIS = { x: { type: 'numeric' as const } };

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

/** A standard normal draw (Box–Muller). */
function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);

  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/** Latencies with a long right tail: log-normal around `median` ms. */
function latencies(args: { count: number; median: number; spread: number; rand: () => number }): number[] {
  const { count, median, spread, rand } = args;

  return Array.from({ length: count }, () => Math.round(median * Math.exp(spread * gaussian(rand))));
}

/** Order sizes in USD; `shift` moves the bulk of them up and down. */
function orderSizes(args: { count: number; shift: number; rand: () => number }): number[] {
  const { count, shift, rand } = args;

  return Array.from({ length: count }, () => Math.round(90 * shift * Math.exp(0.55 * gaussian(rand))));
}

/** Daily returns in %, fat-tailed: mostly calm days, now and then a wild one. */
function returns(rand: () => number): number[] {
  return Array.from({ length: 2520 }, () => {
    const wild = rand() < 0.06;
    const value = gaussian(rand) * (wild ? 3.2 : 1.1) + 0.04;

    return Math.round(value * 100) / 100;
  });
}

const STATIC_DATA: Record<string, HistogramData> = (() => {
  const rand = mulberry32(11);

  return {
    latency: latencies({ count: 4000, median: 120, spread: 0.45, rand }),
    regions: [
      { label: 'eu-west', data: latencies({ count: 2500, median: 95, spread: 0.35, rand }) },
      { label: 'us-east', data: latencies({ count: 2500, median: 160, spread: 0.4, rand }) },
    ],
    returns: returns(rand),
  };
})();

/** Order sizes streaming in `batch` at a time, `rate` times a second, in a rolling window. */
function useOrderStream(args: { live: boolean; rate: number; batch: number }): number[] {
  const { live, rate, batch } = args;
  const [rand] = useState(() => mulberry32(23));
  const [samples, setSamples] = useState(() => orderSizes({ count: LIVE_WINDOW, shift: 1, rand }));

  useEffect(() => {
    if (!live) return;

    let tick = 0;
    const timer = window.setInterval(() => {
      // A hidden tab throttles timers, then fires a burst on return.
      if (document.hidden) return;

      tick++;
      // The bulk of the orders drifts up and back over about half a minute.
      const shift = 1 + 0.35 * Math.sin((tick / rate) * 0.2);
      const fresh = orderSizes({ count: batch, shift, rand });
      setSamples((previous) => [...previous.slice(fresh.length - LIVE_WINDOW), ...fresh]);
    }, 1000 / rate);

    return () => window.clearInterval(timer);
  }, [live, rate, batch, rand]);

  return samples;
}

function seriesOptions(s: HistogramSettings, demo: Demo): Partial<HistogramSeriesOptions> {
  const binning = s.bins > 0 ? { bins: s.bins } : { binWidth: demo.binWidth };

  return {
    ...binning,
    normalize: s.normalize,
    gap: s.gap,
    quantiles: s.quantiles ? demo.quantiles : undefined,
    smoothMs: s.smoothMs,
  };
}

function HistogramChart(props: PlaygroundChartProps & HistogramSettings & { demo: Demo }) {
  const { theme, gradient, perfHudVisible, demo, rate, batch } = props;
  const stream = useOrderStream({ live: demo.live === true, rate, batch });
  const data = demo.live ? stream : STATIC_DATA[demo.id];
  const axis = useMemo((): AxisConfig => ({ ...props.axis, ...NUMERIC_AXIS }), [props.axis]);

  return (
    <ChartContainer
      theme={theme}
      axis={axis}
      gradient={gradient}
      grid={props.grid}
      perf={perfHudVisible ? perfHud() : undefined}
    >
      <Title sub={demo.sub}>{demo.title}</Title>
      <HistogramSeries data={data} options={seriesOptions(props, demo)} />
      {props.tooltipVisible && <Tooltip />}
      {props.crosshairVisible && <Crosshair />}
      {props.axis.y?.visible !== false && <YAxis />}
      {props.axis.x?.visible !== false && <XAxis />}
      {demo.layered && props.legendVisible && <Legend position="bottom" />}
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
  id: 'display-histogram',
  title: 'Display',
  extend: 'display',
  icon: ICONS.display,
  rows: [
    toggleRow({ key: 'tooltipVisible', label: 'Tooltip' }),
    toggleRow({ key: 'crosshairVisible', label: 'Crosshair' }),
    toggleRow({ key: 'legendVisible', label: 'Legend', hint: 'Overlaid card' }),
  ],
};

const SERIES_SECTION: SectionSpec = {
  id: 'series-histogram',
  title: 'Series',
  icon: ICONS.series,
  defaultOpen: true,
  rows: [
    sliderRow({ key: 'bins', label: 'Bins', hint: '0 = the card’s own width', range: { min: 0, max: 60, step: 1 } }),
    {
      key: 'normalize',
      label: 'Height',
      render: (v, onChange) => (
        <ToggleGroup<HistogramNormalize>
          value={v as HistogramNormalize}
          options={[
            { value: 'count', label: 'Count' },
            { value: 'percent', label: 'Percent' },
            { value: 'density', label: 'Density' },
          ]}
          onChange={onChange as (v: HistogramNormalize) => void}
        />
      ),
    },
    sliderRow({ key: 'gap', label: 'Gap', range: { min: 0, max: 4, step: 1 }, suffix: 'px' }),
    toggleRow({ key: 'quantiles', label: 'Quantiles', hint: 'p50, p95 lines' }),
    sliderRow({
      key: 'smoothMs',
      label: 'Morph',
      hint: 'Ease to new data · 0 snaps',
      range: { min: 0, max: 1500, step: 50 },
      suffix: 'ms',
    }),
  ],
};

// The simulated order feed of the live card — demo controls, not chart options.
const DEMO_EXTRA: SectionSpec = {
  id: 'demo-histogram',
  title: 'Demo',
  extend: 'demo',
  rows: [
    sliderRow({
      key: 'rate',
      label: 'Updates',
      hint: 'Order sizes card',
      range: { min: 1, max: 10, step: 1 },
      suffix: '/s',
    }),
    sliderRow({ key: 'batch', label: 'Batch', hint: 'Orders per update', range: { min: 1, max: 200, step: 1 } }),
  ],
};

const SECTIONS = [DEMO_EXTRA, DISPLAY_EXTRA, SERIES_SECTION];

/** The options the Code tab prints: only what differs from the library defaults. */
function codeOptions(s: HistogramSettings, demo: Demo): Record<string, PropValue> {
  const options: Record<string, PropValue> = {};
  if (s.bins > 0) options.bins = s.bins;
  else if (demo.binWidth !== undefined) options.binWidth = demo.binWidth;
  if (s.normalize !== DEFAULTS.normalize) options.normalize = s.normalize;
  if (s.gap !== DEFAULTS.gap) options.gap = s.gap;
  if (s.quantiles) options.quantiles = demo.quantiles;
  if (s.smoothMs !== DEFAULTS.smoothMs) options.smoothMs = s.smoothMs;

  return options;
}

function histogramCode(s: PlaygroundChartProps & HistogramSettings, demo: Demo): ChartCodeConfig {
  const containerProps: Record<string, PropValue> = { axis: { x: { type: 'numeric' } } };
  if (s.gradient) containerProps.gradient = true;

  const options = codeOptions(s, demo);
  const data = demo.layered ? 'layers' : 'data';

  return {
    title: { text: demo.title, sub: demo.sub },
    theme: 'catppuccin.theme',
    containerProps,
    components: [
      { component: 'HistogramSeries', props: { data, ...(Object.keys(options).length > 0 ? { options } : {}) } },
      ...(s.tooltipVisible ? [{ component: 'Tooltip', props: {} }] : []),
      ...(s.crosshairVisible ? [{ component: 'Crosshair', props: {} }] : []),
      { component: 'YAxis', props: {} },
      { component: 'XAxis', props: {} },
      ...(demo.layered && s.legendVisible ? [{ component: 'Legend', props: { position: 'bottom' } }] : []),
    ],
  };
}

export function HistogramPage({ theme }: { theme: ChartTheme }) {
  return (
    <Playground<HistogramSettings>
      id="histogram"
      theme={theme}
      extraDefaults={{
        tooltipVisible: true,
        crosshairVisible: true,
        legendVisible: true,
        bins: 0,
        normalize: DEFAULTS.normalize,
        gap: DEFAULTS.gap,
        quantiles: true,
        smoothMs: DEFAULTS.smoothMs,
        rate: 3,
        batch: 40,
      }}
      gridTemplate="1fr 1fr"
      gridColumns="1fr 1fr"
      mobileRowHeight={360}
      // Histogram motion is driven by the per-series Morph row in the Series section.
      animationKinds={[]}
      sections={SECTIONS}
      charts={(props) =>
        DEMOS.map((demo) => (
          <Cell key={demo.id} theme={props.theme} cardId={demo.id}>
            <HistogramChart key={`${demo.id}-${props.perfHudVisible}`} {...props} demo={demo} />
          </Cell>
        ))
      }
      cards={(s): PlaygroundCard[] =>
        DEMOS.map((demo) => ({ id: demo.id, title: demo.title, sub: demo.sub, code: histogramCode(s, demo) }))
      }
    />
  );
}
