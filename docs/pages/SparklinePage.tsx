import { useMemo } from 'react';

import {
  type ChartTheme,
  Sparkline,
  type SparklineValuePosition,
  type SparklineVariant,
  type TimePoint,
} from '@wick-charts/react';

import type { ChartCodeConfig, PropValue } from '../components/CodePreview';
import { CardFrame } from '../components/playground/cardPick';
import { ICONS } from '../components/playground/icons';
import { Playground, type PlaygroundCard, type PlaygroundChartProps } from '../components/playground/Playground';
import { BoundInput, Slider, Toggle, ToggleGroup, parseBound } from '../components/playground/primitives';
import type { RowSpec, SectionSpec } from '../components/playground/sections';
import {
  type LineStrategy,
  barStrategy,
  generateBarData,
  generateLineData,
  generateWaveData,
  lineDriftStrategy,
  waveStrategy,
} from '../data';
import { DEMO_INTERVAL } from '../data/demo';
import { useIsMobile, useLineStreams } from '../hooks';

// ── Sample data generators ──────────────────────────────────

// Maximum dataset size we pre-generate per row. The "Points" slider in the
// Demo section caps both the static-mode slice and the live-mode flow window
// at this value.
const SPARK_HISTORY = 200;
// Live mode mounts with `SPARK_SEED` points so the stream has `last`/
// `startIndex` to resume from; new ticks flow into the empty right side
// until the window fills. After fill, LineSeries' rolling-window path goes
// through `chart.keepLast` (smooth Y, no per-tick snap).
const SPARK_SEED = 2;
const SPARK_POINTS_MIN = 10;
const SPARK_POINTS_MAX = SPARK_HISTORY;
const SPARK_POINTS_DEFAULT = 80;

// Line thickness in CSS px — mirrors the Sparkline component's strokeWidth default.
const SPARK_STROKE_DEFAULT = 1;

// Streaming cadence — sparklines look better moving at a brisk pace than the
// canonical 5s bar interval. Faster speed = fresh bars every ~500ms.
const SPARK_SPEED = 10;

// Off-screen left buffer. The visible window holds `points` bars; the React
// state caps at `points + STREAM_BUFFER` so a few oldest points sit just
// outside the viewport. Rolling-window trim then drops points that have
// already scrolled off, instead of yanking a still-visible point.
const STREAM_BUFFER = 5;

interface RowMeta {
  label: string;
  sublabel?: string;
  color?: string;
  variant?: SparklineVariant;
  /** A 2×2 tile of the mosaic. */
  hero?: boolean;
}

interface RowSeed extends RowMeta {
  data: TimePoint[];
  strategy: LineStrategy;
}

function makeLineRow(seed: number, label: string, sublabel?: string): RowSeed {
  const startValue = 40 + seed * 20;
  const data = generateLineData(SPARK_HISTORY, startValue, DEMO_INTERVAL);

  return { label, sublabel, data, strategy: lineDriftStrategy(data[data.length - 1]?.value ?? startValue) };
}

function makeWaveRow(seed: number, label: string, sublabel?: string): RowSeed {
  const opts = {
    base: 10 + seed * 5,
    amplitude: 50 + seed * 30,
    period: 20 + seed * 8,
    phase: seed * 0.3,
    interval: DEMO_INTERVAL,
  };
  const data = generateWaveData(SPARK_HISTORY, opts);

  return {
    label,
    sublabel,
    data,
    strategy: waveStrategy({ ...opts, totalHint: SPARK_HISTORY }),
  };
}

function makeBarRow(label: string): RowSeed {
  return {
    label,
    variant: 'bar',
    data: generateBarData(SPARK_HISTORY, DEMO_INTERVAL),
    strategy: barStrategy(100),
  };
}

// ── Metric card rows ────────────────────────────────────────

interface MetricRow extends RowMeta {
  data: TimePoint[];
}

const uptime = () => `${(95 + Math.random() * 5).toFixed(1)}% uptime`;

/**
 * Prices, server health and KPIs with a signed bar row, in mosaic order: the
 * grid auto-places BTC top-left and Errors bottom-right as 2×2 tiles.
 */
function makeSeeds(): RowSeed[] {
  return [
    { ...makeLineRow(0, 'BTC/USD'), hero: true },
    makeLineRow(1, 'ETH/USD'),
    makeLineRow(2, 'SOL/USD'),
    makeWaveRow(0, 'api-prod-1', uptime()),
    makeWaveRow(1, 'worker-01', uptime()),
    makeWaveRow(2, 'db-primary', uptime()),
    makeLineRow(3, 'Revenue'),
    { ...makeBarRow('Errors'), hero: true },
    makeLineRow(4, 'Users'),
  ];
}

// Fills its mosaic tile: the chart stretches to the free space.
const TILE_STYLE = { width: '100%', height: '100%' };
// A little taller than a sparkline's natural height.
const TILE_ROW_HEIGHT = 76;

// ── Settings ────────────────────────────────────────────────

// Where the flow-mode seed sits at mount — drives the fly-in direction. Mirrors
// the Sparkline `flow.align` prop.
type SparklineFlowAlign = 'left' | 'right' | 'offscreen';

interface SparklineSettings {
  variant: SparklineVariant;
  valuePos: SparklineValuePosition;
  areaVisible: boolean;
  strokeWidth: number;
  // BoundInput strings ('auto' | a number | a '+10%' offset) — parsed to the
  // Sparkline `yRange` prop. 'auto' on a side leaves that edge auto-scaled.
  yMin: string;
  yMax: string;
  /** Points of mock data a card shows without `flow`. */
  points: number;
  /**
   * The `flow` prop: a fixed `flowCapacity`-wide window. Live, the seed sits
   * at `flowAlign` of an empty window and new points fill it.
   */
  flow: boolean;
  flowCapacity: number;
  flowAlign: SparklineFlowAlign;
}

type SparkState = PlaygroundChartProps & SparklineSettings;

function flowOf(s: SparklineSettings): { capacity: number; align: SparklineFlowAlign } | undefined {
  return s.flow ? { capacity: s.flowCapacity, align: s.flowAlign } : undefined;
}

// ── Page ────────────────────────────────────────────────────

function SparklineGrid(
  props: PlaygroundChartProps &
    SparklineSettings & {
      rows: MetricRow[];
      mobile: boolean;
      flowWindow?: { capacity: number; align?: SparklineFlowAlign };
    },
) {
  const min = parseBound(props.yMin);
  const max = parseBound(props.yMax);
  const yRange = min !== undefined || max !== undefined ? { min, max } : undefined;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: props.mobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
        gridAutoRows: TILE_ROW_HEIGHT,
        gap: 8,
        padding: 4,
      }}
    >
      {props.rows.map((row) => (
        <CardFrame
          key={row.label}
          cardId={row.label}
          style={{
            position: 'relative',
            borderRadius: 8,
            gridColumn: row.hero && !props.mobile ? 'span 2' : undefined,
            gridRow: row.hero ? 'span 2' : undefined,
          }}
        >
          <Sparkline
            data={row.data}
            theme={props.theme}
            variant={row.variant ?? props.variant}
            valuePosition={props.valuePos}
            label={row.label}
            sublabel={row.sublabel}
            color={row.color}
            area={{ visible: props.areaVisible }}
            strokeWidth={props.strokeWidth}
            yRange={yRange}
            gradient={props.gradient}
            flow={props.flowWindow}
            style={TILE_STYLE}
          />
        </CardFrame>
      ))}
    </div>
  );
}

const SERIES_SECTION: SectionSpec = {
  id: 'series',
  title: 'Sparkline',
  icon: ICONS.series,
  defaultOpen: true,
  rows: [
    {
      key: 'variant',
      label: 'Type',
      render: (v, onChange) => (
        <ToggleGroup<SparklineVariant>
          value={v as SparklineVariant}
          options={[
            { value: 'line', label: 'Line' },
            { value: 'bar', label: 'Bar' },
          ]}
          onChange={onChange as (v: SparklineVariant) => void}
        />
      ),
    },
    {
      key: 'areaVisible',
      label: 'Fill',
      render: (v, onChange) => (
        <ToggleGroup<'on' | 'off'>
          value={(v as boolean) ? 'on' : 'off'}
          options={[
            { value: 'on', label: 'Area' },
            { value: 'off', label: 'Line only' },
          ]}
          onChange={(next) => (onChange as (v: boolean) => void)(next === 'on')}
        />
      ),
    },
    {
      key: 'strokeWidth',
      label: 'Stroke width',
      visible: (s) => s.variant === 'line',
      render: (v, onChange) => (
        <Slider
          value={v as number}
          min={0.5}
          max={4}
          step={0.5}
          suffix="px"
          onChange={onChange as (v: number) => void}
        />
      ),
    },
    {
      key: 'valuePos',
      label: 'Value position',
      render: (v, onChange) => (
        <ToggleGroup<SparklineValuePosition>
          value={v as SparklineValuePosition}
          options={[
            { value: 'left', label: 'Left' },
            { value: 'right', label: 'Right' },
            { value: 'none', label: 'None' },
          ]}
          onChange={onChange as (v: SparklineValuePosition) => void}
        />
      ),
    },
    {
      key: 'yMin',
      label: 'Min Y',
      render: (v, onChange) => <BoundInput value={v as string} onChange={onChange as (v: string) => void} />,
    },
    {
      key: 'yMax',
      label: 'Max Y',
      render: (v, onChange) => <BoundInput value={v as string} onChange={onChange as (v: string) => void} />,
    },
    {
      key: 'flow',
      label: 'Flow',
      hint: 'Fixed window, fills from empty',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'flowCapacity',
      label: 'Capacity',
      hint: 'Points in the window',
      visible: (s) => s.flow === true,
      render: (v, onChange) => (
        <Slider
          value={v as number}
          min={SPARK_POINTS_MIN}
          max={SPARK_POINTS_MAX}
          step={1}
          onChange={onChange as (v: number) => void}
        />
      ),
    },
    {
      key: 'flowAlign',
      label: 'Flow align',
      hint: 'Where the first point sits',
      visible: (s) => s.flow === true,
      render: (v, onChange) => (
        <ToggleGroup<SparklineFlowAlign>
          value={v as SparklineFlowAlign}
          options={[
            { value: 'right', label: 'Right' },
            { value: 'left', label: 'Left' },
            { value: 'offscreen', label: 'Off-screen' },
          ]}
          onChange={onChange as (v: SparklineFlowAlign) => void}
        />
      ),
    },
  ] as RowSpec[],
};

// `hideCartesian` and no Perf HUD leave the page without a built-in Demo, so it brings its own.
const DEMO_SECTION: SectionSpec = {
  id: 'demo',
  title: 'Demo',
  icon: ICONS.data,
  defaultOpen: true,
  rows: [
    {
      key: 'streaming',
      label: 'Mode',
      render: (v, onChange) => (
        <ToggleGroup<'live' | 'static'>
          value={(v as boolean) ? 'live' : 'static'}
          options={[
            { value: 'live', label: 'Live' },
            { value: 'static', label: 'Static' },
          ]}
          onChange={(next) => (onChange as (b: boolean) => void)(next === 'live')}
        />
      ),
    },
    {
      key: 'points',
      label: 'Points',
      visible: (s) => s.flow !== true,
      render: (v, onChange) => (
        <Slider
          value={v as number}
          min={SPARK_POINTS_MIN}
          max={SPARK_POINTS_MAX}
          step={1}
          onChange={onChange as (v: number) => void}
        />
      ),
    },
  ] as RowSpec[],
};

// ── Live sparkline grid ─────────────────────────────────────

interface AnimatedGridProps extends PlaygroundChartProps, SparklineSettings {
  seeds: RowSeed[];
  mobile: boolean;
}

// Sits inside a key={points|flow} boundary so switching the window
// size, or mode remounts the streaming hook with fresh seeds rather than
// tearing through the live tail.
function AnimatedSparklineGrid({ seeds, ...props }: AnimatedGridProps) {
  // Flow mounts with a SPARK_SEED-sized seed so the stream has `last`/`startIndex`
  // to resume from; without flow the window starts full at `points` bars.
  const windowSize = props.flow ? props.flowCapacity : props.points;
  const seriesHistory = useMemo(
    () => seeds.map((s) => (props.flow ? s.data.slice(0, SPARK_SEED) : s.data.slice(-windowSize))),
    [seeds, props.flow, windowSize],
  );
  const strategies = useMemo(() => seeds.map((s) => s.strategy), [seeds]);

  const { datasets } = useLineStreams(seriesHistory, {
    interval: DEMO_INTERVAL,
    speed: SPARK_SPEED,
    // STREAM_BUFFER extra points sit just off-screen left so trimming
    // doesn't yank a still-visible point off the canvas.
    maxPoints: windowSize + STREAM_BUFFER,
    strategy: (_series, i) => strategies[i],
  });

  const rows: MetricRow[] = seeds.map((seed, i) => ({
    label: seed.label,
    sublabel: seed.sublabel,
    color: seed.color,
    variant: seed.variant,
    hero: seed.hero,
    data: datasets[i]?.length ? datasets[i] : seriesHistory[i],
  }));

  return <SparklineGrid {...props} rows={rows} flowWindow={flowOf(props)} />;
}

function sparklineCode(s: SparkState, row: RowMeta): ChartCodeConfig {
  const props: Record<string, PropValue> = { data: 'data', label: row.label };
  if (row.sublabel) props.sublabel = row.sublabel;
  if (row.color) props.color = row.color;

  const variant = row.variant ?? s.variant;
  if (variant !== 'line') props.variant = variant;
  if (s.valuePos !== 'right') props.valuePosition = s.valuePos;

  if (s.flow) {
    const flowProp: Record<string, PropValue> = { capacity: s.flowCapacity };
    if (s.flowAlign !== 'right') flowProp.align = s.flowAlign;
    props.flow = flowProp;
  }

  if (variant === 'line' && s.strokeWidth !== SPARK_STROKE_DEFAULT) props.strokeWidth = s.strokeWidth;
  if (!s.areaVisible) props.area = { visible: false };

  // `yRange` only for the sides pinned away from auto.
  const yMin = parseBound(s.yMin);
  const yMax = parseBound(s.yMax);
  if (yMin !== undefined || yMax !== undefined) {
    const range: Record<string, PropValue> = {};
    if (yMin !== undefined) range.min = yMin as PropValue;
    if (yMax !== undefined) range.max = yMax as PropValue;
    props.yRange = range;
  }

  if (s.gradient) props.gradient = true;
  props.style = TILE_STYLE;

  return {
    theme: 'catppuccin.theme',
    // Sparkline manages its own ChartContainer — render it standalone.
    container: false,
    components: [{ component: 'Sparkline', props }],
    reactOnly: { note: SMALL_CHART_NOTE, equivalent: smallChartCode(variant) },
  };
}

const SMALL_CHART_NOTE = 'Sparkline is React only. This small chart draws the same series, without the value block.';

/** The Vue and Svelte stand-in for `<Sparkline>`: a chart with no axes, grid or interaction. */
function smallChartCode(variant: SparklineVariant): ChartCodeConfig {
  const series = variant === 'bar' ? 'BarSeries' : 'LineSeries';

  return {
    theme: 'catppuccin.theme',
    containerProps: {
      interactive: false,
      grid: { visible: false },
      axis: { x: { visible: false }, y: { visible: false } },
      style: 'height: 48px; min-height: 0',
    },
    components: [{ component: series, props: { data: 'data' } }],
  };
}

export function SparklinePage({ theme }: { theme: ChartTheme }) {
  const mobile = useIsMobile();

  // Pre-generate seeds with bundled streaming strategies — keeps history and
  // live samplers statistically aligned per row.
  const baseSeeds = useMemo(makeSeeds, []);

  /** Each line row in its own theme series color; bar rows keep the up/down colors. */
  const themedSeeds = (seeds: RowSeed[]): RowSeed[] =>
    seeds.map((seed, i) => ({
      ...seed,
      color: seed.variant === 'bar' ? undefined : theme.seriesColors[i % theme.seriesColors.length],
    }));

  return (
    <Playground<SparklineSettings>
      id="sparkline"
      theme={theme}
      hideCartesian
      showPerfHud={false}
      // Sparkline owns its internal animations (fixed flow drive-in, no axes) —
      // suppress the built-in candle/bar/line + X/Y Animations section entirely.
      animationKinds={[]}
      extraDefaults={{
        variant: 'line',
        valuePos: 'right',
        areaVisible: true,
        strokeWidth: SPARK_STROKE_DEFAULT,
        yMin: 'auto',
        yMax: 'auto',
        points: SPARK_POINTS_DEFAULT,
        flow: false,
        flowCapacity: SPARK_POINTS_DEFAULT,
        flowAlign: 'right',
      }}
      sections={[DEMO_SECTION, SERIES_SECTION]}
      charts={(props) => {
        const seeds = themedSeeds(baseSeeds);

        if (!props.streaming) {
          // Static: the tail of the pre-generated history, `points` long or the flow window.
          const length = props.flow ? props.flowCapacity : props.points;
          const rows: MetricRow[] = seeds.map((seed) => ({
            label: seed.label,
            sublabel: seed.sublabel,
            color: seed.color,
            variant: seed.variant,
            hero: seed.hero,
            data: seed.data.slice(-length),
          }));

          return <SparklineGrid {...props} rows={rows} mobile={mobile} flowWindow={flowOf(props)} />;
        }

        // Remount the stream on a window or flow change, so a fresh
        // seed never reinterprets the live tail mid-flight.
        return (
          <AnimatedSparklineGrid
            key={`${props.points}-${props.flow}-${props.flowCapacity}-${props.flowAlign}`}
            {...props}
            seeds={seeds}
            mobile={mobile}
          />
        );
      }}
      cards={(s): PlaygroundCard[] =>
        themedSeeds(baseSeeds).map((row) => ({
          id: row.label,
          title: row.label,
          sub: row.sublabel,
          code: sparklineCode(s, row),
        }))
      }
    />
  );
}
