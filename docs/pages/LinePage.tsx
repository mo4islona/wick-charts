import { useMemo, useState } from 'react';

import {
  ChartContainer,
  type ChartTheme,
  Crosshair,
  type CurveKind,
  InfoBar,
  Legend,
  LineSeries,
  Navigator,
  type StackingMode,
  type TimePoint,
  Title,
  Tooltip,
  type TooltipSort,
  XAxis,
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
import {
  type GrowthOpts,
  type LineStrategy,
  generateGrowthData,
  generateLineData,
  generatePnlData,
  generateWaveData,
  growthStrategy,
  lineDriftStrategy,
  pnlStrategy,
  waveStrategy,
} from '../data';
import { DEMO_INTERVAL } from '../data/demo';
import { useLineStreams } from '../hooks';

type DataMode = 'wave' | 'line' | 'growth';
type LegendPos = 'off' | 'bottom' | 'right';
type LegendMode = 'toggle' | 'isolate';
type AreaBaseline = 'floor' | 'zero';

interface LineSettings {
  dataMode: DataMode;
  areaVisible: boolean;
  areaBaseline: AreaBaseline;
  curve: CurveKind;
  strokeWidth: number;
  pulse: boolean;
  pointsVisible: boolean;
  pointsRadius: number;
  stacking: StackingMode;
  tooltipSort: TooltipSort;
  tooltipCustom: boolean;
  legendPos: LegendPos;
  legendMode: LegendMode;
  infoBarVisible: boolean;
  tooltipVisible: boolean;
  crosshairVisible: boolean;
}

const MULTI_COUNT = 6;

type LineState = PlaygroundChartProps & LineSettings;
type CardId = 'single' | 'multi' | 'pnl';

interface CardHead {
  title: string;
  sub: string;
}

function stackTitle(stacking: StackingMode): string {
  if (stacking === 'off') return 'Overlapping';
  if (stacking === 'normal') return 'Stacked';

  return '100%';
}

/** Each card's title and subtitle, shared by the charts and the Code tab. */
function cardHeads(s: LineState): Record<CardId, CardHead> {
  const multiLinear = axisForStacking(s.axis, s.stacking) !== s.axis;
  const pnlLinear = withLinearY(s.axis) !== s.axis;
  const series = `${MULTI_COUNT} series`;

  return {
    single: { title: 'Single', sub: s.areaVisible ? 'area' : 'line' },
    multi: { title: stackTitle(s.stacking), sub: multiLinear ? `${series} · linear` : series },
    pnl: { title: 'P&L', sub: pnlLinear ? 'Baseline 0 · linear' : 'Baseline 0' },
  };
}

/** Compounding series, a couple of decades apart — reads best on a log axis. */
function growthOpts(index: number): GrowthOpts {
  return { start: 2 * (index + 1), rate: 0.014 + index * 0.003 };
}

function makeData(mode: DataMode, count: number, index: number): TimePoint[] {
  if (mode === 'growth') {
    return generateGrowthData(count, { ...growthOpts(index), interval: DEMO_INTERVAL });
  }

  if (mode === 'wave') {
    return generateWaveData(count, {
      base: 5,
      amplitude: 100 + index * 40,
      period: 50 + index * 15,
      phase: index * 0.12,
      onset: index * 0.06,
      interval: DEMO_INTERVAL,
    });
  }

  return generateLineData(count, 80 + index * 30, DEMO_INTERVAL);
}

/** Build a streaming strategy that matches `makeData`'s generator for the given mode. */
function strategyFor(mode: DataMode) {
  return (series: TimePoint[], index: number): LineStrategy => {
    if (mode === 'growth') {
      const opts = growthOpts(index);

      return growthStrategy({ ...opts, start: series[series.length - 1]?.value ?? opts.start });
    }

    return mode === 'wave'
      ? waveStrategy({
          base: 5,
          amplitude: 100 + index * 40,
          period: 50 + index * 15,
          phase: index * 0.12,
          onset: index * 0.06,
          totalHint: series.length,
        })
      : lineDriftStrategy(series[series.length - 1]?.value ?? 100);
  };
}

/** The `area` option the Fill + Baseline controls stand for. */
function areaOption({ areaVisible, areaBaseline }: LineSettings): { visible: boolean; baseline?: number } {
  if (areaBaseline === 'zero') return { visible: areaVisible, baseline: 0 };

  return { visible: areaVisible };
}

function SingleChart(props: LineState & { allData: TimePoint[][]; head: CardHead }) {
  const { datasets } = useLineStreams(props.allData, {
    interval: DEMO_INTERVAL,
    speed: 5,
    strategy: strategyFor(props.dataMode),
  });
  const data = props.streaming ? [datasets[0]] : [props.allData[0]];
  const sid = 'line';
  const animations = useAnimationsProp(props);

  return (
    <ChartContainer
      theme={props.theme}
      axis={props.axis}
      gradient={props.gradient}
      headerLayout={props.headerLayout}
      perf={props.perfHudVisible ? perfHud() : undefined}
      animations={animations}
      // Point markers auto-hide when too dense; cap the window so the demo
      // spacing clears the density guard across the whole radius slider range.
      viewport={props.pointsVisible ? { maxVisibleBars: 30 } : undefined}
    >
      <Title sub={props.head.sub}>{props.head.title}</Title>
      {props.infoBarVisible && <InfoBar sort={props.tooltipSort} />}
      <LineSeries
        id={sid}
        data={data}
        options={{
          area: areaOption(props),
          curve: props.curve,
          strokeWidth: props.strokeWidth,
          pulse: props.pulse,
          entryAnimation: props.lineEntryAnimation,
          points: props.pointsVisible ? { visible: true, radius: props.pointsRadius } : undefined,
        }}
      />
      {props.tooltipVisible && renderTooltip(props)}
      {props.crosshairVisible && <Crosshair />}
      {props.axis?.y?.visible !== false && <YAxis />}
      {props.axis?.x?.visible !== false && <XAxis />}
      {props.legendPos !== 'off' && <Legend position={props.legendPos} mode={props.legendMode} />}
      {props.navigatorVisible && <Navigator data={{ type: 'line', series: data }} height={props.navigatorHeight} />}
    </ChartContainer>
  );
}

function renderTooltip({ tooltipCustom, tooltipSort }: LineSettings) {
  if (!tooltipCustom) return <Tooltip sort={tooltipSort} />;

  return (
    <Tooltip sort={tooltipSort}>
      {({ snapshots, time }) => (
        <div style={{ display: 'grid', gap: 4, minWidth: 140 }}>
          <small style={{ opacity: 0.6 }}>{new Date(time).toLocaleTimeString()}</small>
          {snapshots.slice(0, 3).map((s) => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: s.color, fontWeight: 500 }}>{s.label ?? s.seriesId}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                {('value' in s.data ? s.data.value : 0).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Tooltip>
  );
}

function MultiChart(props: LineState & { allData: TimePoint[][]; head: CardHead }) {
  const { datasets } = useLineStreams(props.allData, {
    interval: DEMO_INTERVAL,
    speed: 5,
    strategy: strategyFor(props.dataMode),
  });
  const display = props.streaming ? datasets : props.allData;
  const animations = useAnimationsProp(props);
  const axis = axisForStacking(props.axis, props.stacking);

  return (
    <ChartContainer
      theme={props.theme}
      axis={axis}
      gradient={props.gradient}
      headerLayout={props.headerLayout}
      perf={props.perfHudVisible ? perfHud() : undefined}
      animations={animations}
      viewport={props.pointsVisible ? { maxVisibleBars: 30 } : undefined}
    >
      <Title sub={props.head.sub}>{props.head.title}</Title>
      {props.infoBarVisible && <InfoBar sort={props.tooltipSort} />}
      <LineSeries
        data={display}
        options={{
          // Multi-layer lines default to the theme palette (seriesColors).
          area: areaOption(props),
          curve: props.curve,
          strokeWidth: props.strokeWidth,
          pulse: props.pulse,
          stacking: props.stacking,
          entryAnimation: props.lineEntryAnimation,
          points: props.pointsVisible ? { visible: true, radius: props.pointsRadius } : undefined,
        }}
      />
      {props.tooltipVisible && renderTooltip(props)}
      {props.crosshairVisible && <Crosshair />}
      {props.axis?.y?.visible !== false && <YAxis />}
      {props.axis?.x?.visible !== false && <XAxis />}
      {props.legendPos !== 'off' && <Legend position={props.legendPos} mode={props.legendMode} />}
      {props.navigatorVisible && <Navigator data={{ type: 'line', series: display }} height={props.navigatorHeight} />}
    </ChartContainer>
  );
}

/** Running P&L in the classic baseline look: the fill closes to 0, up color above it, down color below. */
function PnlChart(props: LineState & { head: CardHead }) {
  const [history] = useState(() => [generatePnlData(300)]);
  const { datasets } = useLineStreams(history, {
    interval: DEMO_INTERVAL,
    speed: 5,
    strategy: () => pnlStrategy(),
  });
  const series = props.streaming ? datasets[0] : history[0];
  const animations = useAnimationsProp(props);
  // P&L is signed, and a log axis has no place for values ≤ 0.
  const axis = withLinearY(props.axis);
  const { up, down } = props.theme.candlestick;
  // The pulse dot, info bar and legend read the series color — sign it by the latest P&L.
  const signColor = useMemo(() => (value: number) => (value >= 0 ? up.wick : down.wick), [up.wick, down.wick]);

  return (
    <ChartContainer
      theme={props.theme}
      axis={axis}
      gradient={props.gradient}
      headerLayout={props.headerLayout}
      perf={props.perfHudVisible ? perfHud() : undefined}
      animations={animations}
      viewport={props.pointsVisible ? { maxVisibleBars: 30 } : undefined}
    >
      <Title sub={props.head.sub}>{props.head.title}</Title>
      {props.infoBarVisible && <InfoBar sort={props.tooltipSort} />}
      <LineSeries
        data={{ label: 'P&L', color: signColor, data: series }}
        options={{
          area: { visible: props.areaVisible, baseline: 0 },
          threshold: { value: 0, above: up.wick, below: down.wick },
          curve: props.curve,
          strokeWidth: props.strokeWidth,
          pulse: props.pulse,
          entryAnimation: props.lineEntryAnimation,
          points: props.pointsVisible ? { visible: true, radius: props.pointsRadius } : undefined,
        }}
      />
      {props.tooltipVisible && renderTooltip(props)}
      {props.crosshairVisible && <Crosshair />}
      {props.axis?.y?.visible !== false && <YAxis />}
      {props.axis?.x?.visible !== false && <XAxis />}
      {props.navigatorVisible && <Navigator data={{ type: 'line', series: [series] }} height={props.navigatorHeight} />}
    </ChartContainer>
  );
}

const DISPLAY_EXTRA: SectionSpec = {
  id: 'display-line',
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
      key: 'crosshairVisible',
      label: 'Crosshair',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
  ] as RowSpec[],
};

const DEMO_EXTRA: SectionSpec = {
  id: 'demo-line',
  title: 'Demo',
  extend: 'demo',
  rows: [
    {
      key: 'dataMode',
      label: 'Data',
      render: (v, onChange) => (
        <Select<DataMode>
          value={v as DataMode}
          options={[
            { value: 'wave', label: 'Wave' },
            { value: 'line', label: 'Random' },
            { value: 'growth', label: 'Growth' },
          ]}
          onChange={onChange as (v: DataMode) => void}
        />
      ),
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
      key: 'strokeWidth',
      label: 'Stroke width',
      render: (v, onChange) => (
        <Slider value={v as number} min={0} max={5} step={0.5} suffix="px" onChange={onChange as (v: number) => void} />
      ),
    },
    {
      key: 'pulse',
      label: 'Pulse',
      hint: 'Halo at the last point',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'areaVisible',
      label: 'Fill',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'areaBaseline',
      label: 'Baseline',
      hint: 'Value the fill closes to · unstacked only',
      visible: (s) => s.areaVisible,
      render: (v, onChange) => (
        <ToggleGroup<AreaBaseline>
          value={v as AreaBaseline}
          options={[
            { value: 'floor', label: 'Floor' },
            { value: 'zero', label: '0' },
          ]}
          onChange={onChange as (v: AreaBaseline) => void}
        />
      ),
    },
    {
      key: 'pointsVisible',
      label: 'Points',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'pointsRadius',
      label: 'Point radius',
      visible: (s) => s.pointsVisible,
      render: (v, onChange) => (
        <Slider value={v as number} min={1} max={6} step={0.5} suffix="px" onChange={onChange as (v: number) => void} />
      ),
    },
  ] as RowSpec[],
};

const TOOLTIP_SECTION: SectionSpec = {
  id: 'tooltip',
  title: 'Tooltip',
  icon: ICONS.tooltip,
  rows: [
    {
      key: 'tooltipVisible',
      label: 'Tooltip',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'tooltipSort',
      label: 'Sort',
      render: (v, onChange) => (
        <ToggleGroup<TooltipSort>
          value={v as TooltipSort}
          options={[
            { value: 'none', label: 'None' },
            { value: 'asc', label: 'Asc' },
            { value: 'desc', label: 'Desc' },
          ]}
          onChange={onChange as (v: TooltipSort) => void}
        />
      ),
    },
    {
      key: 'tooltipCustom',
      label: 'Custom render',
      hint: 'Top 3 rows via render prop',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
  ] as RowSpec[],
};

const CUSTOM_TOOLTIP_SNIPPETS = {
  react: `{({ snapshots, time }) => (
  <div style={{ display: 'grid', gap: 4 }}>
    <small>{new Date(time).toLocaleTimeString()}</small>
    {snapshots.slice(0, 3).map((s) => (
      <div key={s.id} style={{ color: s.color }}>
        {s.label ?? s.seriesId}: {('value' in s.data ? s.data.value : 0).toFixed(2)}
      </div>
    ))}
  </div>
)}`,
  vue: `<template #default="{ snapshots, time }">
  <div>
    <small>{{ new Date(time).toLocaleTimeString() }}</small>
    <div v-for="s in snapshots.slice(0, 3)" :key="s.id" :style="{ color: s.color }">
      {{ s.label ?? s.seriesId }}: {{ ('value' in s.data ? s.data.value : 0).toFixed(2) }}
    </div>
  </div>
</template>`,
  svelte: `<svelte:fragment let:snapshots let:time>
  <small>{new Date(time).toLocaleTimeString()}</small>
  {#each snapshots.slice(0, 3) as s (s.id)}
    <div style="color: {s.color}">
      {s.label ?? s.seriesId}: {('value' in s.data ? s.data.value : 0).toFixed(2)}
    </div>
  {/each}
</svelte:fragment>`,
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

/** `area` as the Code tab prints it: the library shows the area unless told otherwise. */
function areaCode(area: { visible: boolean; baseline?: number }): Record<string, PropValue> {
  if (!area.visible) return { area: { visible: false } };
  if (area.baseline !== undefined) return { area: { baseline: area.baseline } };

  return {};
}

/** The series look the panel sets on every card. */
function lineOptions(s: LineState): Record<string, PropValue> {
  return {
    ...buildCommonSeriesOptions(s, 'line'),
    ...areaCode({ visible: s.areaVisible, baseline: s.areaBaseline === 'zero' ? 0 : undefined }),
    ...(s.curve !== 'straight' ? { curve: s.curve } : {}),
    ...(s.strokeWidth !== 1 ? { strokeWidth: s.strokeWidth } : {}),
    ...(s.pulse ? {} : { pulse: false }),
    ...(s.pointsVisible
      ? { points: { visible: true, ...(s.pointsRadius !== 3 ? { radius: s.pointsRadius } : {}) } }
      : {}),
  };
}

function lineSeries(data: string, options: Record<string, PropValue>): ChartCodeChild {
  const props: Record<string, PropValue> = { data };
  if (Object.keys(options).length > 0) props.options = options;

  return { component: 'LineSeries', props };
}

/** Info bar, tooltip, crosshair, axes and legend, as the panel sets them. */
function overlayCode(s: LineState, legend: boolean): ChartCodeChild[] {
  const sort = s.tooltipSort !== 'none' ? { props: { sort: s.tooltipSort } } : {};
  const legendProps: Record<string, PropValue> = {};
  if (s.legendPos !== 'bottom') legendProps.position = s.legendPos;
  if (s.legendMode !== 'toggle') legendProps.mode = s.legendMode;

  return [
    ...(s.infoBarVisible ? [{ component: 'InfoBar', ...sort }] : []),
    ...(s.tooltipVisible
      ? [{ component: 'Tooltip', ...sort, ...(s.tooltipCustom ? { childrenSnippet: CUSTOM_TOOLTIP_SNIPPETS } : {}) }]
      : []),
    ...(s.crosshairVisible ? [{ component: 'Crosshair' }] : []),
    ...(s.axis?.y?.visible !== false ? [{ component: 'YAxis' }] : []),
    ...(s.axis?.x?.visible !== false ? [{ component: 'XAxis' }] : []),
    ...(legend && s.legendPos !== 'off' ? [{ component: 'Legend', props: legendProps }] : []),
  ];
}

function cardCode(args: {
  s: LineState;
  head: CardHead;
  axis: LineState['axis'];
  series: ChartCodeChild;
  legend: boolean;
  navigator: ChartCodeChild[];
}): ChartCodeConfig {
  const { s, head, axis, series, legend, navigator } = args;
  const containerProps = buildCartesianContainerProps({ ...s, axis }) ?? {};
  // The demo data is dense: the same window cap as the preview lets the dots clear the density guard.
  if (s.pointsVisible) containerProps.viewport = { maxVisibleBars: 30 };

  return {
    title: { text: head.title, sub: head.sub },
    theme: 'catppuccin.theme',
    containerProps: Object.keys(containerProps).length > 0 ? containerProps : undefined,
    components: [series, ...overlayCode(s, legend), ...navigator],
  };
}

function lineCards(s: LineState): PlaygroundCard[] {
  const heads = cardHeads(s);
  const options = lineOptions(s);

  const multiOptions = { ...options, ...(s.stacking !== 'off' ? { stacking: s.stacking } : {}) };
  const multiNavigator = buildNavigatorComponent(s, 'series').map((nav) => ({
    ...nav,
    props: { ...nav.props, data: { type: 'line', series: 'series' } },
  }));

  const pnlOptions = { ...options, ...areaCode({ visible: s.areaVisible, baseline: 0 }) };
  pnlOptions.threshold = { value: 0, above: 'upColor', below: 'downColor' };

  const codes: Record<CardId, ChartCodeConfig> = {
    single: cardCode({
      s,
      head: heads.single,
      axis: s.axis,
      series: lineSeries('data', options),
      legend: true,
      navigator: buildNavigatorComponent(s, 'data[0]'),
    }),
    multi: cardCode({
      s,
      head: heads.multi,
      axis: axisForStacking(s.axis, s.stacking),
      series: lineSeries('series', multiOptions),
      legend: true,
      navigator: multiNavigator,
    }),
    pnl: cardCode({
      s,
      head: heads.pnl,
      axis: withLinearY(s.axis),
      series: lineSeries('pnl', pnlOptions),
      legend: false,
      navigator: buildNavigatorComponent(s, 'pnl'),
    }),
  };

  return (Object.keys(codes) as CardId[]).map((id) => ({ id, ...heads[id], code: codes[id] }));
}

export function LinePage({ theme }: { theme: ChartTheme }) {
  return (
    <Playground<LineSettings>
      id="line"
      theme={theme}
      animationKinds={['line']}
      gridTemplate="1fr 1fr 1fr"
      mobileRowHeight={300}
      extraDefaults={(mobile) => ({
        dataMode: 'wave',
        areaVisible: true,
        areaBaseline: 'floor',
        curve: 'straight',
        strokeWidth: 1,
        pulse: true,
        pointsVisible: false,
        pointsRadius: 3,
        stacking: 'off',
        tooltipSort: 'desc',
        tooltipCustom: false,
        legendPos: 'bottom',
        legendMode: 'toggle',
        infoBarVisible: !mobile,
        tooltipVisible: true,
        crosshairVisible: true,
      })}
      sections={[DEMO_EXTRA, DISPLAY_EXTRA, SERIES_SECTION, TOOLTIP_SECTION, LEGEND_SECTION]}
      charts={(props) => {
        const single = [makeData(props.dataMode, 300, 0)];
        const multi = Array.from({ length: MULTI_COUNT }, (_, i) => makeData(props.dataMode, 300, i));
        const heads = cardHeads(props);

        return (
          <>
            <Cell theme={props.theme} cardId="single">
              <SingleChart
                key={`${props.dataMode}-${props.streaming}-${props.perfHudVisible}-${props.pointsVisible}-s`}
                {...props}
                allData={single}
                head={heads.single}
              />
            </Cell>
            <Cell theme={props.theme} cardId="multi">
              <MultiChart
                key={`${props.dataMode}-${props.streaming}-${props.stacking}-${props.perfHudVisible}-${props.pointsVisible}-m`}
                {...props}
                allData={multi}
                head={heads.multi}
              />
            </Cell>
            <Cell theme={props.theme} cardId="pnl">
              <PnlChart
                key={`${props.streaming}-${props.perfHudVisible}-${props.pointsVisible}-p`}
                {...props}
                head={heads.pnl}
              />
            </Cell>
          </>
        );
      }}
      cards={lineCards}
    />
  );
}
