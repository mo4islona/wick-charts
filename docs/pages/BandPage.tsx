import { useMemo } from 'react';

import {
  type BandPoint,
  BandSeries,
  type BandSeriesOptions,
  ChartContainer,
  type ChartTheme,
  Crosshair,
  type CurveKind,
  InfoBar,
  Legend,
  LineSeries,
  type LineSeriesOptions,
  Navigator,
  type TimePoint,
  Title,
  Tooltip,
  XAxis,
  YAxis,
  perfHud,
} from '@wick-charts/react';

import { Cell } from '../components/Cell';
import type { ChartCodeConfig, PropValue } from '../components/CodePreview';
import {
  buildCartesianContainerProps,
  buildCommonSeriesOptions,
  buildNavigatorComponent,
  useAnimationsProp,
} from '../components/playground/codeMappings';
import { ICONS } from '../components/playground/icons';
import { Playground, type PlaygroundCard, type PlaygroundChartProps } from '../components/playground/Playground';
import { Select, Slider, Toggle, ToggleGroup } from '../components/playground/primitives';
import type { RowSpec, SectionSpec } from '../components/playground/sections';
import { type LineStrategy, generateLineData, lineDriftStrategy } from '../data';
import { DEMO_INTERVAL } from '../data/demo';
import { useLineStreams } from '../hooks';
import { hexToRgba } from '../utils';

type FillMode = 'gradient' | 'solid';
type LegendPos = 'off' | 'bottom' | 'right';
type LegendMode = 'toggle' | 'isolate';

interface BandSettings {
  curve: CurveKind;
  fill: FillMode;
  edgesVisible: boolean;
  edgeWidth: number;
  lineVisible: boolean;
  legendPos: LegendPos;
  legendMode: LegendMode;
  infoBarVisible: boolean;
  tooltipVisible: boolean;
  crosshairVisible: boolean;
}

type ChartProps = PlaygroundChartProps & BandSettings;

const HISTORY = 300;
const WINDOW = 20;
const EDGE_WIDTH_DEFAULT = 1;

interface BandCard {
  id: string;
  title: string;
  sub: string;
  /** The center line's variable name in the Code tab. */
  line: string;
}

const BOLLINGER: BandCard = { id: 'bollinger', title: 'Bollinger', sub: `SMA ${WINDOW} ± 2σ`, line: 'price' };
const FAN: BandCard = { id: 'fan', title: 'Fan', sub: '2 bands', line: 'mean' };

interface Envelope {
  mean: TimePoint[];
  /** One band per multiplier, in the order the multipliers were given. */
  bands: BandPoint[][];
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Rolling mean ± k·σ over the last `WINDOW` points, one band per `k`. */
function envelope(points: readonly TimePoint[], ks: readonly number[]): Envelope {
  const mean: TimePoint[] = [];
  const bands: BandPoint[][] = ks.map(() => []);

  for (let i = WINDOW - 1; i < points.length; i++) {
    let sum = 0;
    for (let j = i - WINDOW + 1; j <= i; j++) {
      sum += points[j].value;
    }
    const avg = sum / WINDOW;

    let variance = 0;
    for (let j = i - WINDOW + 1; j <= i; j++) {
      const d = points[j].value - avg;
      variance += d * d;
    }
    const sd = Math.sqrt(variance / WINDOW);
    const time = points[i].time;

    mean.push({ time, value: roundCents(avg) });
    for (let layer = 0; layer < ks.length; layer++) {
      const k = ks[layer];
      bands[layer].push({ time, low: roundCents(avg - k * sd), high: roundCents(avg + k * sd) });
    }
  }

  return { mean, bands };
}

function driftStrategy(series: TimePoint[]): LineStrategy {
  return lineDriftStrategy(series[series.length - 1]?.value ?? 100);
}

/**
 * A random walk that streams while the playground's Live toggle is on. It leads
 * with `WINDOW - 1` warm-up points, which only feed the first band window.
 */
function usePrice(streaming: boolean): TimePoint[] {
  const history = useMemo(() => [generateLineData(HISTORY + WINDOW - 1, 100, DEMO_INTERVAL)], []);
  const { datasets } = useLineStreams(history, { interval: DEMO_INTERVAL, speed: 5, strategy: driftStrategy });

  return streaming ? datasets[0] : history[0];
}

/** The price from its first full window on, so the line never starts ahead of its band. */
function useShownPrice(price: TimePoint[]): TimePoint[] {
  return useMemo(() => price.slice(WINDOW - 1), [price]);
}

function solidFill(theme: ChartTheme): string {
  return hexToRgba(theme.bands.upper, 0.2);
}

function lineOptions(props: ChartProps): Partial<LineSeriesOptions> {
  return {
    area: { visible: false },
    strokeWidth: 1,
    entryAnimation: props.lineEntryAnimation,
  };
}

function bandOptions(props: ChartProps): Partial<BandSeriesOptions> {
  return {
    curve: props.curve,
    fill: props.fill === 'solid' ? solidFill(props.theme) : undefined,
    stroke: { visible: props.edgesVisible, width: props.edgeWidth },
    entryAnimation: props.bandEntryAnimation,
  };
}

// A plain call, not a component: ChartContainer finds its Legend and Navigator slots only through Fragments.
function renderOverlays(props: ChartProps, navigatorData: TimePoint[]) {
  return (
    <>
      {props.tooltipVisible && <Tooltip />}
      {props.crosshairVisible && <Crosshair />}
      {props.axis?.y?.visible !== false && <YAxis />}
      {props.axis?.x?.visible !== false && <XAxis />}
      {props.legendPos !== 'off' && <Legend position={props.legendPos} mode={props.legendMode} />}
      {props.navigatorVisible && (
        <Navigator data={{ type: 'line', series: [navigatorData] }} height={props.navigatorHeight} />
      )}
    </>
  );
}

function BollingerChart(props: ChartProps) {
  const price = usePrice(props.streaming);
  const shown = useShownPrice(price);
  const { bands } = useMemo(() => envelope(price, [2]), [price]);
  const animations = useAnimationsProp(props);

  return (
    <ChartContainer
      theme={props.theme}
      axis={props.axis}
      gradient={props.gradient}
      headerLayout={props.headerLayout}
      perf={props.perfHudVisible ? perfHud() : undefined}
      animations={animations}
    >
      <Title sub={BOLLINGER.sub}>{BOLLINGER.title}</Title>
      {props.infoBarVisible && <InfoBar />}
      {/* Declared first so the price line draws over the band. */}
      <BandSeries id="band" data={{ label: 'Band', data: bands[0] }} options={bandOptions(props)} />
      {props.lineVisible && (
        <LineSeries id="price" data={{ label: 'Price', data: shown }} options={lineOptions(props)} />
      )}
      {renderOverlays(props, shown)}
    </ChartContainer>
  );
}

function FanChart(props: ChartProps) {
  const price = usePrice(props.streaming);
  const shown = useShownPrice(price);
  const { mean, bands } = useMemo(() => envelope(price, [2, 1]), [price]);
  const animations = useAnimationsProp(props);

  return (
    <ChartContainer
      theme={props.theme}
      axis={props.axis}
      gradient={props.gradient}
      headerLayout={props.headerLayout}
      perf={props.perfHudVisible ? perfHud() : undefined}
      animations={animations}
    >
      <Title sub={FAN.sub}>{FAN.title}</Title>
      {props.infoBarVisible && <InfoBar />}
      <BandSeries
        data={[
          { label: '±2σ', data: bands[0] },
          { label: '±1σ', data: bands[1] },
        ]}
        options={bandOptions(props)}
      />
      {props.lineVisible && <LineSeries data={{ label: 'Mean', data: mean }} options={lineOptions(props)} />}
      {renderOverlays(props, shown)}
    </ChartContainer>
  );
}

const DISPLAY_EXTRA: SectionSpec = {
  id: 'display-band',
  title: 'Display',
  extend: 'display',
  icon: ICONS.display,
  rows: [
    {
      key: 'infoBarVisible',
      label: 'Info bar',
      hint: 'Series values above the chart',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'tooltipVisible',
      label: 'Tooltip',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'crosshairVisible',
      label: 'Crosshair',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
  ] as RowSpec[],
};

const SERIES_SECTION: SectionSpec = {
  id: 'series',
  title: 'Series',
  icon: ICONS.series,
  rows: [
    {
      key: 'curve',
      label: 'Curve',
      render: (v, onChange) => (
        <ToggleGroup<CurveKind>
          value={v as CurveKind}
          options={[
            { value: 'straight', label: 'Straight' },
            { value: 'smooth', label: 'Smooth' },
            { value: 'stepped', label: 'Stepped' },
          ]}
          onChange={onChange as (v: CurveKind) => void}
        />
      ),
    },
    {
      key: 'fill',
      label: 'Fill',
      render: (v, onChange) => (
        <ToggleGroup<FillMode>
          value={v as FillMode}
          options={[
            { value: 'gradient', label: 'Gradient' },
            { value: 'solid', label: 'Solid' },
          ]}
          onChange={onChange as (v: FillMode) => void}
        />
      ),
    },
    {
      key: 'edgesVisible',
      label: 'Edges',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'edgeWidth',
      label: 'Edge width',
      visible: (s) => s.edgesVisible,
      render: (v, onChange) => (
        <Slider
          value={v as number}
          min={0.5}
          max={3}
          step={0.5}
          suffix="px"
          onChange={onChange as (v: number) => void}
        />
      ),
    },
    {
      key: 'lineVisible',
      label: 'Center line',
      hint: 'Price or mean',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
  ] as RowSpec[],
};

const LEGEND_SECTION: SectionSpec = {
  id: 'legend',
  title: 'Legend',
  icon: ICONS.legend,
  rows: [
    {
      key: 'legendPos',
      label: 'Position',
      render: (v, onChange) => (
        <Select<LegendPos>
          value={v as LegendPos}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'bottom', label: 'Bottom' },
            { value: 'right', label: 'Right' },
          ]}
          onChange={onChange as (v: LegendPos) => void}
        />
      ),
    },
    {
      key: 'legendMode',
      label: 'On click',
      visible: (s) => s.legendPos !== 'off',
      render: (v, onChange) => (
        <ToggleGroup<LegendMode>
          value={v as LegendMode}
          options={[
            { value: 'toggle', label: 'Show / Hide' },
            { value: 'isolate', label: 'Focus' },
          ]}
          onChange={onChange as (v: LegendMode) => void}
        />
      ),
    },
  ] as RowSpec[],
};

function bandCodeOptions(s: ChartProps): Record<string, PropValue> {
  const stroke: Record<string, PropValue> = {};
  if (!s.edgesVisible) stroke.visible = false;
  if (s.edgesVisible && s.edgeWidth !== EDGE_WIDTH_DEFAULT) stroke.width = s.edgeWidth;

  return {
    ...buildCommonSeriesOptions(s, 'band'),
    ...(s.curve !== 'straight' ? { curve: s.curve } : {}),
    ...(s.fill === 'solid' ? { fill: solidFill(s.theme) } : {}),
    ...(Object.keys(stroke).length > 0 ? { stroke } : {}),
  };
}

function lineCodeOptions(s: ChartProps): Record<string, PropValue> {
  return { ...buildCommonSeriesOptions(s, 'line'), area: { visible: false } };
}

function bandCode(s: ChartProps, card: BandCard): ChartCodeConfig {
  const containerProps = buildCartesianContainerProps(s) ?? {};
  const options = bandCodeOptions(s);
  const yVisible = s.axis?.y?.visible !== false;
  const xVisible = s.axis?.x?.visible !== false;
  const legendProps: Record<string, PropValue> = {};
  if (s.legendPos !== 'bottom') legendProps.position = s.legendPos;
  if (s.legendMode !== 'toggle') legendProps.mode = s.legendMode;

  return {
    title: { text: card.title, sub: card.sub },
    theme: 'catppuccin.theme',
    containerProps: Object.keys(containerProps).length > 0 ? containerProps : undefined,
    components: [
      {
        component: 'BandSeries',
        props: {
          data: 'bands',
          ...(Object.keys(options).length > 0 ? { options } : {}),
        },
      },
      ...(s.lineVisible ? [{ component: 'LineSeries', props: { data: card.line, options: lineCodeOptions(s) } }] : []),
      ...(s.infoBarVisible ? [{ component: 'InfoBar' }] : []),
      ...(s.tooltipVisible ? [{ component: 'Tooltip' }] : []),
      ...(s.crosshairVisible ? [{ component: 'Crosshair' }] : []),
      ...(yVisible ? [{ component: 'YAxis' }] : []),
      ...(xVisible ? [{ component: 'XAxis' }] : []),
      ...(s.legendPos !== 'off' ? [{ component: 'Legend', props: legendProps }] : []),
      // Both navigators show the price.
      ...buildNavigatorComponent(s, 'price'),
    ],
  };
}

export function BandPage({ theme }: { theme: ChartTheme }) {
  return (
    <Playground<BandSettings>
      id="band"
      theme={theme}
      animationKinds={['band', 'line']}
      mobileRowHeight={300}
      extraDefaults={(mobile) => ({
        curve: 'straight',
        fill: 'gradient',
        edgesVisible: true,
        edgeWidth: EDGE_WIDTH_DEFAULT,
        lineVisible: true,
        legendPos: 'bottom',
        legendMode: 'toggle',
        infoBarVisible: !mobile,
        tooltipVisible: true,
        crosshairVisible: true,
      })}
      sections={[DISPLAY_EXTRA, SERIES_SECTION, LEGEND_SECTION]}
      charts={(props) => (
        <>
          <Cell theme={props.theme} cardId={BOLLINGER.id}>
            <BollingerChart key={`${props.streaming}-${props.perfHudVisible}-b`} {...props} />
          </Cell>
          <Cell theme={props.theme} cardId={FAN.id}>
            <FanChart key={`${props.streaming}-${props.perfHudVisible}-f`} {...props} />
          </Cell>
        </>
      )}
      cards={(s): PlaygroundCard[] =>
        [BOLLINGER, FAN].map((card) => ({ id: card.id, title: card.title, sub: card.sub, code: bandCode(s, card) }))
      }
    />
  );
}
