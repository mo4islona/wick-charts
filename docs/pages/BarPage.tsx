import { useEffect, useMemo, useState } from 'react';

import {
  type AxisConfig,
  BarSeries,
  ChartContainer,
  type ChartTheme,
  Crosshair,
  InfoBar,
  Legend,
  Navigator,
  type StackingMode,
  Title,
  Tooltip,
  XAxis,
  type XPointInput,
  YAxis,
  perfHud,
} from '@wick-charts/react';

import { Cell } from '../components/Cell';
import type { ChartCodeChild, ChartCodeConfig, PropValue } from '../components/CodePreview';
import {
  axisForStacking,
  buildCartesianContainerProps,
  buildCommonSeriesOptions,
  buildNavigatorComponent,
  useAnimationsProp,
  withLinearY,
} from '../components/playground/codeMappings';
import { ICONS } from '../components/playground/icons';
import { Playground, type PlaygroundCard, type PlaygroundChartProps } from '../components/playground/Playground';
import { Select, Slider, Toggle, ToggleGroup } from '../components/playground/primitives';
import type { RowSpec, SectionSpec } from '../components/playground/sections';
import { generateBarData, generateLayerData } from '../data';
import { DEMO_INTERVAL } from '../data/demo';
import { useLineStreams } from '../hooks';

type BarWidth = 'thin' | 'normal' | 'wide';
type XAxisKind = 'time' | 'category';
type LegendPos = 'off' | 'bottom' | 'right';
type LegendMode = 'toggle' | 'isolate';
const BAR_WIDTH_MAP: Record<BarWidth, number> = { thin: 0.3, normal: 0.6, wide: 0.85 };
const LAYER_COUNT = 4;

// Mirror the core BarSeries cornerRadius default so the code preview only emits
// the prop when the slider diverges from it.
const BAR_DEFAULT_RADIUS = 2;
// Mirror the core `axis.x.padding.inner` default, for the same reason.
const DEFAULT_BAND_GAP = 0.3;

interface BarSettings {
  xAxisType: XAxisKind;
  valueLabels: boolean;
  bandGap: number;
  stacking: StackingMode;
  barWidth: BarWidth;
  cornerRadius: number;
  legendPos: LegendPos;
  legendMode: LegendMode;
  infoBarVisible: boolean;
  tooltipVisible: boolean;
  crosshairVisible: boolean;
}

const singleData = generateBarData(80, DEMO_INTERVAL);
const layers = Array.from({ length: LAYER_COUNT }, (_, i) => generateLayerData(80, [60, 40, 25, 15][i], DEMO_INTERVAL));

// Category mode: one band per region. Signed changes for the single chart, one layer per quarter for the multi one.
const REGIONS = ['Europe', 'Asia', 'Americas', 'Africa', 'Oceania'];
const REGION_CHANGE = [4, 6, -5, 3, -2];
const REGION_LAYERS = [
  [42, 35, 28, 12],
  [30, 26, 18, 10],
  [22, 21, 14, 8],
  [15, 12, 9, 5],
  [9, 8, 6, 3],
];
// Live category updates — slow next to the 250 ms value ease, so each one settles.
const CATEGORY_UPDATE_MS = 1500;

/** Re-roll each base value a little on every update while `live`. */
function useLiveRegions<T>(args: { live: boolean; build: (jitter: (value: number) => number) => T }): T {
  const { live, build } = args;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!live) return;

    const id = window.setInterval(() => {
      if (document.hidden) return;

      setTick((t) => t + 1);
    }, CATEGORY_UPDATE_MS);

    return () => window.clearInterval(id);
  }, [live]);

  return useMemo(() => {
    const spread = tick === 0 ? 0 : 0.15;

    return build((value) => Math.round(value * (1 + (Math.random() * 2 - 1) * spread)));
  }, [tick, build]);
}

const buildRegionChange = (jitter: (value: number) => number): XPointInput[] =>
  REGIONS.map((x, i) => ({ x, value: jitter(REGION_CHANGE[i]) }));

const buildRegionLayers = (jitter: (value: number) => number): XPointInput[][] =>
  Array.from({ length: LAYER_COUNT }, (_, layer) =>
    REGIONS.map((x, i) => ({ x, value: jitter(REGION_LAYERS[i][layer]) })),
  );

type BarState = PlaygroundChartProps & BarSettings;
type CardId = 'single' | 'multi';

interface CardHead {
  title: string;
  sub: string;
}

function multiTitle(s: BarSettings): string {
  if (s.stacking === 'normal') return 'Stacked';
  if (s.stacking === 'percent') return '100%';

  return s.xAxisType === 'category' ? 'Grouped' : 'Overlapping';
}

/** Each card's title and subtitle, shared by the charts and the Code tab. */
function cardHeads(s: BarState): Record<CardId, CardHead> {
  const singleLinear = withLinearY(s.axis) !== s.axis;
  const multiLinear = s.stacking === 'percent' && s.axis?.y?.scale !== undefined;
  const layersSub = `${LAYER_COUNT} layers`;

  return {
    single: { title: 'Single', sub: singleLinear ? 'Up/Down · linear' : 'Up/Down' },
    multi: { title: multiTitle(s), sub: multiLinear ? `${layersSub} · linear` : layersSub },
  };
}

/** The multi chart's Y axis: overlapping bars read from a zero floor, which a log axis has not. */
function multiAxis(s: BarState): AxisConfig {
  const axis = axisForStacking(s.axis ?? {}, s.stacking);
  if (s.stacking === 'off' && axis.y?.scale === undefined) return { ...axis, y: { min: 0, ...axis.y } };

  return axis;
}

/** The playground's axis with the category X axis merged in, when that mode is on. */
function withXAxisType(axis: AxisConfig, s: BarSettings): AxisConfig {
  if (s.xAxisType !== 'category') return axis;

  return { ...axis, x: { ...axis.x, type: 'category', padding: { inner: s.bandGap } } };
}

function SingleBarChart(props: BarState & { head: CardHead }) {
  // speed=5 matches the other playground pages (see CandlestickPage) so new
  // bars append about once per second and the entry animations stay visible.
  const { datasets } = useLineStreams([singleData], {
    interval: DEMO_INTERVAL,
    speed: 5,
    kind: 'bar',
  });
  const regions = useLiveRegions({ live: props.streaming && props.xAxisType === 'category', build: buildRegionChange });
  const category = props.xAxisType === 'category';
  const timeDisplay = props.streaming ? datasets[0] : singleData;
  const display = category ? regions : timeDisplay;
  const animations = useAnimationsProp(props);
  // Up/Down bars are signed, and a log axis has no place for values ≤ 0.
  const linearAxis = withLinearY(props.axis);
  const axis = useMemo(() => withXAxisType(linearAxis, props), [linearAxis, props.xAxisType, props.bandGap]);

  return (
    <ChartContainer
      theme={props.theme}
      axis={axis}
      gradient={props.gradient}
      headerLayout={category ? 'inline' : props.headerLayout}
      perf={props.perfHudVisible ? perfHud() : undefined}
      animations={animations}
    >
      <Title sub={props.head.sub}>{props.head.title}</Title>
      {props.infoBarVisible && <InfoBar />}
      <BarSeries
        data={[display]}
        options={{
          // Sign coloring (green-up / red-down) comes from the theme's bar.color.
          barWidthRatio: BAR_WIDTH_MAP[props.barWidth],
          stacking: 'off',
          cornerRadius: props.cornerRadius,
          entryAnimation: props.barEntryAnimation,
          valueLabels: props.valueLabels,
        }}
      />
      {props.tooltipVisible && <Tooltip />}
      {props.crosshairVisible && <Crosshair />}
      {props.axis?.y?.visible !== false && <YAxis />}
      {props.axis?.x?.visible !== false && <XAxis />}
      {props.navigatorVisible && !category && (
        <Navigator data={{ type: 'bar', points: timeDisplay }} height={props.navigatorHeight} />
      )}
    </ChartContainer>
  );
}

function MultiBarChart(props: BarState & { head: CardHead }) {
  const { datasets } = useLineStreams(layers, {
    interval: DEMO_INTERVAL,
    speed: 5,
    kind: 'layer',
  });
  const category = props.xAxisType === 'category';
  const regions = useLiveRegions({ live: props.streaming && category, build: buildRegionLayers });
  const timeDisplay = props.streaming ? datasets : layers;
  const display = category ? regions : timeDisplay;
  const chartAxis = useMemo<AxisConfig>(
    () => withXAxisType(multiAxis(props), props),
    [props.axis, props.stacking, props.xAxisType, props.bandGap],
  );
  const animations = useAnimationsProp(props);

  return (
    <ChartContainer
      theme={props.theme}
      axis={chartAxis}
      gradient={props.gradient}
      headerLayout={category ? 'inline' : props.headerLayout}
      perf={props.perfHudVisible ? perfHud() : undefined}
      animations={animations}
    >
      <Title sub={props.head.sub}>{props.head.title}</Title>
      {props.infoBarVisible && <InfoBar />}
      <BarSeries
        data={display}
        options={{
          // Multi-layer bars default to the theme palette (seriesColors).
          barWidthRatio: BAR_WIDTH_MAP[props.barWidth],
          stacking: props.stacking,
          cornerRadius: props.cornerRadius,
          entryAnimation: props.barEntryAnimation,
          valueLabels: props.valueLabels,
        }}
      />
      {props.tooltipVisible && <Tooltip />}
      {props.crosshairVisible && <Crosshair />}
      {props.axis?.y?.visible !== false && <YAxis />}
      {props.axis?.x?.visible !== false && <XAxis />}
      {props.legendPos !== 'off' && <Legend position={props.legendPos} mode={props.legendMode} />}
      {props.navigatorVisible && !category && (
        <Navigator data={{ type: 'bar', series: timeDisplay }} height={props.navigatorHeight} />
      )}
    </ChartContainer>
  );
}

const SERIES_SECTION: SectionSpec = {
  id: 'series',
  title: 'Series',
  icon: ICONS.series,
  rows: [
    {
      key: 'xAxisType',
      label: 'X axis',
      hint: 'Category: one band per region',
      render: (v, onChange) => (
        <ToggleGroup<XAxisKind>
          value={v as XAxisKind}
          options={[
            { value: 'time', label: 'Time' },
            { value: 'category', label: 'Category' },
          ]}
          onChange={onChange as (v: XAxisKind) => void}
        />
      ),
    },
    {
      key: 'bandGap',
      label: 'Band gap',
      hint: 'Fraction of one step',
      visible: (s) => s.xAxisType === 'category',
      render: (v, onChange) => (
        <Slider value={v as number} min={0} max={0.6} step={0.05} onChange={onChange as (v: number) => void} />
      ),
    },
    {
      key: 'barWidth',
      label: 'Width',
      visible: (s) => s.xAxisType !== 'category',
      render: (v, onChange) => (
        <ToggleGroup<BarWidth>
          value={v as BarWidth}
          options={[
            { value: 'thin', label: 'Thin' },
            { value: 'normal', label: 'Normal' },
            { value: 'wide', label: 'Wide' },
          ]}
          onChange={onChange as (v: BarWidth) => void}
        />
      ),
    },
    {
      key: 'stacking',
      label: 'Stack',
      hint: '100% stays on a linear Y axis',
      render: (v, onChange) => (
        <ToggleGroup<StackingMode>
          value={v as StackingMode}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'normal', label: 'Normal' },
            { value: 'percent', label: '100%' },
          ]}
          onChange={onChange as (v: StackingMode) => void}
        />
      ),
    },
    {
      key: 'valueLabels',
      label: 'Value labels',
      hint: 'None on 100%',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'cornerRadius',
      label: 'Corner radius',
      hint: 'Free end only · 0 = square',
      render: (v, onChange) => (
        <Slider value={v as number} min={0} max={12} step={1} suffix="px" onChange={onChange as (v: number) => void} />
      ),
    },
  ] as RowSpec[],
};

const DISPLAY_EXTRA: SectionSpec = {
  id: 'display-bar',
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
      key: 'infoBarVisible',
      label: 'Info bar',
      hint: 'Series values above the chart',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'crosshairVisible',
      label: 'Crosshair',
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

function barCode(args: {
  s: BarState;
  head: CardHead;
  axis: AxisConfig;
  series: ChartCodeChild;
  legend: boolean;
  navigator: ChartCodeChild[];
}): ChartCodeConfig {
  const { s, head, axis, series, legend, navigator } = args;
  const category = s.xAxisType === 'category';
  const containerProps = buildCartesianContainerProps({ ...s, axis }) ?? {};
  if (category) {
    // Value labels on the tallest bar would run into an overlaid title.
    containerProps.headerLayout = 'inline';
    const axisProps = (containerProps.axis ?? {}) as Record<string, PropValue>;
    const x: Record<string, PropValue> = { ...((axisProps.x ?? {}) as Record<string, PropValue>), type: 'category' };
    if (s.bandGap !== DEFAULT_BAND_GAP) x.padding = { inner: s.bandGap };
    containerProps.axis = { ...axisProps, x };
  }

  const legendProps: Record<string, PropValue> = {};
  if (s.legendPos !== 'bottom') legendProps.position = s.legendPos;
  if (s.legendMode !== 'toggle') legendProps.mode = s.legendMode;

  return {
    title: { text: head.title, sub: head.sub },
    theme: 'catppuccin.theme',
    containerProps: Object.keys(containerProps).length > 0 ? containerProps : undefined,
    components: [
      series,
      ...(s.infoBarVisible ? [{ component: 'InfoBar' }] : []),
      ...(s.tooltipVisible ? [{ component: 'Tooltip' }] : []),
      ...(s.crosshairVisible ? [{ component: 'Crosshair' }] : []),
      ...(s.axis?.y?.visible !== false ? [{ component: 'YAxis' }] : []),
      ...(s.axis?.x?.visible !== false ? [{ component: 'XAxis' }] : []),
      ...(legend && s.legendPos !== 'off' ? [{ component: 'Legend', props: legendProps }] : []),
      ...(category ? [] : navigator),
    ],
  };
}

function barCards(s: BarState): PlaygroundCard[] {
  const heads = cardHeads(s);
  const category = s.xAxisType === 'category';
  const options: Record<string, PropValue> = {
    ...buildCommonSeriesOptions(s, 'bar'),
    ...(category || s.barWidth === 'normal' ? {} : { barWidthRatio: BAR_WIDTH_MAP[s.barWidth] }),
    ...(s.valueLabels ? { valueLabels: true } : {}),
    ...(s.cornerRadius !== BAR_DEFAULT_RADIUS ? { cornerRadius: s.cornerRadius } : {}),
  };
  const multiOptions = { ...options, ...(s.stacking !== 'off' ? { stacking: s.stacking } : {}) };
  const multiNavigator = buildNavigatorComponent(s, 'layers', 'bar').map((nav) => ({
    ...nav,
    props: { ...nav.props, data: { type: 'bar', series: 'layers' } },
  }));

  const codes: Record<CardId, ChartCodeConfig> = {
    single: barCode({
      s,
      head: heads.single,
      axis: withLinearY(s.axis),
      series: {
        component: 'BarSeries',
        props: { data: 'data', ...(Object.keys(options).length > 0 ? { options } : {}) },
      },
      legend: false,
      navigator: buildNavigatorComponent(s, 'data', 'bar'),
    }),
    multi: barCode({
      s,
      head: heads.multi,
      axis: multiAxis(s),
      series: {
        component: 'BarSeries',
        props: { data: 'layers', ...(Object.keys(multiOptions).length > 0 ? { options: multiOptions } : {}) },
      },
      legend: true,
      navigator: multiNavigator,
    }),
  };

  return (Object.keys(codes) as CardId[]).map((id) => ({ id, ...heads[id], code: codes[id] }));
}

export function BarPage({ theme }: { theme: ChartTheme }) {
  return (
    <Playground<BarSettings>
      id="bar"
      theme={theme}
      mobileRowHeight={280}
      extraDefaults={(mobile) => ({
        xAxisType: 'time',
        valueLabels: false,
        bandGap: DEFAULT_BAND_GAP,
        stacking: 'normal',
        barWidth: 'normal',
        cornerRadius: 4,
        legendPos: 'bottom',
        legendMode: 'toggle',
        infoBarVisible: !mobile,
        tooltipVisible: true,
        crosshairVisible: true,
      })}
      animationKinds={['bar']}
      sections={[DISPLAY_EXTRA, SERIES_SECTION, LEGEND_SECTION]}
      charts={(props) => {
        const heads = cardHeads(props);

        return (
          <>
            <Cell theme={props.theme} cardId="single">
              <SingleBarChart
                key={`s-${props.streaming}-${props.perfHudVisible}-${props.xAxisType}`}
                {...props}
                head={heads.single}
              />
            </Cell>
            <Cell theme={props.theme} cardId="multi">
              <MultiBarChart
                key={`m-${props.streaming}-${props.stacking}-${props.perfHudVisible}-${props.xAxisType}`}
                {...props}
                head={heads.multi}
              />
            </Cell>
          </>
        );
      }}
      cards={barCards}
    />
  );
}
