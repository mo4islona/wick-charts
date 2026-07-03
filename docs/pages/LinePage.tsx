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
import type { PropValue } from '../components/CodePreview';
import {
  buildCartesianContainerProps,
  buildCommonSeriesOptions,
  buildNavigatorComponent,
  useAnimationsProp,
} from '../components/playground/codeMappings';
import { ICONS } from '../components/playground/icons';
import { Playground, type PlaygroundChartProps } from '../components/playground/Playground';
import { Select, Slider, Toggle, ToggleGroup } from '../components/playground/primitives';
import type { RowSpec, SectionSpec } from '../components/playground/sections';
import { type LineStrategy, generateLineData, generateWaveData, lineDriftStrategy, waveStrategy } from '../data';
import { DEMO_INTERVAL } from '../data/demo';
import { useLineStreams } from '../hooks';

type DataMode = 'wave' | 'line';
type LegendPos = 'off' | 'bottom' | 'right';
type LegendMode = 'toggle' | 'isolate';

interface LineSettings {
  dataMode: DataMode;
  areaVisible: boolean;
  curve: CurveKind;
  strokeWidth: number;
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

function makeData(mode: DataMode, count: number, index: number): TimePoint[] {
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
  return (series: TimePoint[], index: number): LineStrategy =>
    mode === 'wave'
      ? waveStrategy({
          base: 5,
          amplitude: 100 + index * 40,
          period: 50 + index * 15,
          phase: index * 0.12,
          onset: index * 0.06,
          totalHint: series.length,
        })
      : lineDriftStrategy(series[series.length - 1]?.value ?? 100);
}

function SingleChart(props: PlaygroundChartProps & LineSettings & { allData: TimePoint[][] }) {
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
      <Title sub={props.areaVisible ? 'area' : 'line'}>Single</Title>
      {props.infoBarVisible && <InfoBar sort={props.tooltipSort} />}
      <LineSeries
        id={sid}
        data={data}
        options={{
          area: { visible: props.areaVisible },
          curve: props.curve,
          strokeWidth: props.strokeWidth,
          pulse: props.streaming,
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

function MultiChart(props: PlaygroundChartProps & LineSettings & { allData: TimePoint[][]; title: string }) {
  const { datasets } = useLineStreams(props.allData, {
    interval: DEMO_INTERVAL,
    speed: 5,
    strategy: strategyFor(props.dataMode),
  });
  const display = props.streaming ? datasets : props.allData;
  const animations = useAnimationsProp(props);

  return (
    <ChartContainer
      theme={props.theme}
      axis={props.axis}
      gradient={props.gradient}
      headerLayout={props.headerLayout}
      perf={props.perfHudVisible ? perfHud() : undefined}
      animations={animations}
      viewport={props.pointsVisible ? { maxVisibleBars: 30 } : undefined}
    >
      <Title sub={`${MULTI_COUNT} series`}>{props.title}</Title>
      {props.infoBarVisible && <InfoBar sort={props.tooltipSort} />}
      <LineSeries
        data={display}
        options={{
          // Multi-layer lines default to the theme palette (seriesColors).
          area: { visible: props.areaVisible },
          curve: props.curve,
          strokeWidth: props.strokeWidth,
          pulse: props.streaming,
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
      hint: 'Vertical + horizontal cursor lines',
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
      hint: 'Mock generator used by the live preview',
      render: (v, onChange) => (
        <Select<DataMode>
          value={v as DataMode}
          options={[
            { value: 'wave', label: 'Wave' },
            { value: 'line', label: 'Random' },
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
      hint: 'Stroke + area share one path',
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
      key: 'areaVisible',
      label: 'Fill',
      hint: 'Area gradient below the line',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'pointsVisible',
      label: 'Points',
      hint: 'Dot at each data point',
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
      hint: 'On hover',
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
      hint: 'Top 3 rows via slot / render-prop',
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

export function LinePage({ theme }: { theme: ChartTheme }) {
  return (
    <Playground<LineSettings>
      id="line"
      theme={theme}
      animationKinds={['line']}
      extraDefaults={(mobile) => ({
        dataMode: 'wave',
        areaVisible: true,
        curve: 'straight',
        strokeWidth: 1,
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
        const label = props.stacking === 'off' ? 'Overlapping' : props.stacking === 'normal' ? 'Stacked' : '100%';

        return (
          <>
            <Cell theme={props.theme}>
              <SingleChart
                key={`${props.dataMode}-${props.streaming}-${props.perfHudVisible}-${props.pointsVisible}-s`}
                {...props}
                allData={single}
              />
            </Cell>
            <Cell theme={props.theme}>
              <MultiChart
                key={`${props.dataMode}-${props.streaming}-${props.stacking}-${props.perfHudVisible}-${props.pointsVisible}-m`}
                {...props}
                allData={multi}
                title={label}
              />
            </Cell>
          </>
        );
      }}
      codeConfig={(s) => {
        const containerProps = buildCartesianContainerProps(s) ?? {};
        if (s.perfHudVisible) containerProps.perf = 'perfHud()';
        // Mirrors the live preview: the demo data is dense, so the snippet
        // carries the same window cap that lets the dots clear the density guard.
        if (s.pointsVisible) containerProps.viewport = { maxVisibleBars: 30 };

        const options: Record<string, PropValue> = {
          ...buildCommonSeriesOptions(s, 'line'),
          ...(s.areaVisible ? { area: { visible: true } } : {}),
          ...(s.curve !== 'straight' ? { curve: s.curve } : {}),
          ...(s.strokeWidth !== 1 ? { strokeWidth: s.strokeWidth } : {}),
          ...(s.pointsVisible
            ? { points: { visible: true, ...(s.pointsRadius !== 3 ? { radius: s.pointsRadius } : {}) } }
            : {}),
          ...(s.stacking !== 'off' ? { stacking: s.stacking } : {}),
        };

        const yVisible = s.axis?.y?.visible !== false;
        const xVisible = s.axis?.x?.visible !== false;

        return {
          theme: 'catppuccin.theme',
          containerProps: Object.keys(containerProps).length > 0 ? containerProps : undefined,
          components: [
            {
              component: 'LineSeries',
              props: {
                data: 'data',
                ...(Object.keys(options).length > 0 ? { options } : {}),
              },
            },
            ...(s.infoBarVisible
              ? [{ component: 'InfoBar', ...(s.tooltipSort !== 'none' ? { props: { sort: s.tooltipSort } } : {}) }]
              : []),
            ...(s.tooltipVisible
              ? [
                  {
                    component: 'Tooltip',
                    ...(s.tooltipSort !== 'none' ? { props: { sort: s.tooltipSort } } : {}),
                    ...(s.tooltipCustom ? { childrenSnippet: CUSTOM_TOOLTIP_SNIPPETS } : {}),
                  },
                ]
              : []),
            ...(s.crosshairVisible ? [{ component: 'Crosshair' }] : []),
            ...(yVisible ? [{ component: 'YAxis' }] : []),
            ...(xVisible ? [{ component: 'XAxis' }] : []),
            ...(s.legendPos !== 'off'
              ? [
                  {
                    component: 'Legend',
                    props: {
                      ...(s.legendPos !== 'bottom' ? { position: s.legendPos } : {}),
                      ...(s.legendMode !== 'toggle' ? { mode: s.legendMode } : {}),
                    },
                  },
                ]
              : []),
            ...buildNavigatorComponent(s, 'data[0]'),
          ],
        };
      }}
    />
  );
}
