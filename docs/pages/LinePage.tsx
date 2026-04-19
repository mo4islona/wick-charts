import {
  type BarStacking,
  ChartContainer,
  type ChartTheme,
  Crosshair,
  Legend,
  type LineData,
  LineSeries,
  Title,
  Tooltip,
  TooltipLegend,
  type TooltipSort,
  XAxis,
  YAxis,
} from '@wick-charts/react';

import { Cell } from '../components/Cell';
import { Section, Select, Slider, Switch, ToggleGroup } from '../components/controls';
import { Playground, type PlaygroundChartProps } from '../components/Playground';
import { type LineStrategy, generateLineData, generateWaveData, lineDriftStrategy, waveStrategy } from '../data';
import { DEMO_INTERVAL } from '../data/demo';
import { useLineStreams } from '../hooks';

type DataMode = 'wave' | 'line';

interface LineSettings {
  dataMode: DataMode;
  areaFill: boolean;
  lineWidth: number;
  stacking: BarStacking;
  tooltipSort: TooltipSort;
  legendPos: 'off' | 'bottom' | 'right';
  legendMode: 'toggle' | 'solo';
  showTooltipLegend: boolean;
}

const MULTI_COUNT = 6;

function makeData(mode: DataMode, count: number, index: number): LineData[] {
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
  return (series: LineData[], index: number): LineStrategy =>
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

function SingleChart(props: PlaygroundChartProps & LineSettings & { allData: LineData[][] }) {
  const { datasets } = useLineStreams(props.allData, {
    startDelay: 300,
    interval: DEMO_INTERVAL,
    // See CandlestickPage for why a playground speed multiplier is needed even
    // at the canonical interval: keeps append animations visibly frequent.
    speed: 5,
    strategy: strategyFor(props.dataMode),
  });
  const data = props.streaming ? [datasets[0]] : [props.allData[0]];
  const sid = 'line';
  return (
    <ChartContainer theme={props.theme} axis={props.axis} gradient={props.gradient} headerLayout={props.headerLayout}>
      <Title sub={props.areaFill ? 'area' : 'line'}>Single</Title>
      {props.showTooltipLegend && <TooltipLegend seriesId={sid} sort={props.tooltipSort} />}
      <LineSeries
        id={sid}
        data={data}
        options={{
          areaFill: props.areaFill,
          lineWidth: props.lineWidth,
          pulse: props.streaming,
          enterAnimation: props.lineEnterAnimation,
          enterMs: props.enterMs,
          smoothMs: props.liveTracking ? undefined : 0,
        }}
      />
      <Tooltip seriesId={sid} sort={props.tooltipSort} />
      <Crosshair />
      {props.axis?.y?.visible !== false && <YAxis />}
      {props.axis?.x?.visible !== false && <XAxis />}
      {props.legendPos !== 'off' && <Legend position={props.legendPos} mode={props.legendMode} />}
    </ChartContainer>
  );
}

function MultiChart(props: PlaygroundChartProps & LineSettings & { allData: LineData[][]; title: string }) {
  const { datasets } = useLineStreams(props.allData, {
    startDelay: 500,
    interval: DEMO_INTERVAL,
    speed: 5,
    strategy: strategyFor(props.dataMode),
  });
  const display = props.streaming ? datasets : props.allData;
  return (
    <ChartContainer theme={props.theme} axis={props.axis} gradient={props.gradient} headerLayout={props.headerLayout}>
      <Title sub={`${MULTI_COUNT} series`}>{props.title}</Title>
      {props.showTooltipLegend && <TooltipLegend sort={props.tooltipSort} />}
      <LineSeries
        data={display}
        options={{
          colors: props.theme.seriesColors.slice(0, display.length),
          areaFill: props.areaFill,
          lineWidth: props.lineWidth,
          pulse: props.streaming,
          stacking: props.stacking,
          enterAnimation: props.lineEnterAnimation,
          enterMs: props.enterMs,
          smoothMs: props.liveTracking ? undefined : 0,
        }}
      />
      <Tooltip sort={props.tooltipSort} />
      <Crosshair />
      {props.axis?.y?.visible !== false && <YAxis />}
      {props.axis?.x?.visible !== false && <XAxis />}
      {props.legendPos !== 'off' && <Legend position={props.legendPos} mode={props.legendMode} />}
    </ChartContainer>
  );
}

export function LinePage({ theme }: { theme: ChartTheme }) {
  return (
    <Playground<LineSettings>
      id="line"
      theme={theme}
      animationKinds={['line']}
      defaults={{
        dataMode: 'wave',
        areaFill: false,
        lineWidth: 1,
        stacking: 'off',
        tooltipSort: 'desc',
        legendPos: 'bottom',
        legendMode: 'toggle',
        showTooltipLegend: true,
      }}
      charts={(props) => {
        const single = [makeData(props.dataMode, 300, 0)];
        const multi = Array.from({ length: MULTI_COUNT }, (_, i) => makeData(props.dataMode, 300, i));
        const label = props.stacking === 'off' ? 'Overlapping' : props.stacking === 'normal' ? 'Stacked' : '100%';
        return (
          <>
            <Cell theme={props.theme}>
              <SingleChart key={`${props.dataMode}-${props.streaming}-s`} {...props} allData={single} />
            </Cell>
            <Cell theme={props.theme}>
              <MultiChart
                key={`${props.dataMode}-${props.streaming}-${props.stacking}-m`}
                {...props}
                allData={multi}
                title={label}
              />
            </Cell>
          </>
        );
      }}
      settings={(s, set) => (
        <>
          <Section title="Series" theme={theme} noBorder>
            <ToggleGroup
              label="Fill"
              options={[
                { value: 'line', label: 'Line' },
                { value: 'area', label: 'Area' },
              ]}
              value={s.areaFill ? 'area' : 'line'}
              onChange={(v) => set({ areaFill: v === 'area' })}
              theme={theme}
            />
            <Select
              label="Data"
              options={[
                { value: 'wave', label: 'Wave' },
                { value: 'line', label: 'Random' },
              ]}
              value={s.dataMode}
              onChange={(v) => set({ dataMode: v as DataMode })}
              theme={theme}
            />
            <ToggleGroup
              label="Stack"
              options={[
                { value: 'off', label: 'Off' },
                { value: 'normal', label: 'Normal' },
                { value: 'percent', label: '100%' },
              ]}
              value={s.stacking}
              onChange={(v) => set({ stacking: v as BarStacking })}
              theme={theme}
            />
            <Slider
              label="Line width"
              value={s.lineWidth}
              onChange={(v) => set({ lineWidth: v })}
              min={0}
              max={5}
              step={0.5}
              suffix="px"
              theme={theme}
            />
          </Section>
          <Section title="Tooltip" theme={theme} accent={theme.axis.textColor}>
            <ToggleGroup
              label="Sort"
              options={[
                { value: 'none', label: 'None' },
                { value: 'asc', label: 'Asc' },
                { value: 'desc', label: 'Desc' },
              ]}
              value={s.tooltipSort}
              onChange={(v) => set({ tooltipSort: v as TooltipSort })}
              theme={theme}
            />
            <Switch
              label="Info bar"
              checked={s.showTooltipLegend}
              onChange={(v) => set({ showTooltipLegend: v })}
              theme={theme}
            />
          </Section>
          <Section title="Legend" theme={theme} accent={theme.axis.textColor}>
            <Select
              label="Position"
              options={[
                { value: 'off', label: 'Off' },
                { value: 'bottom', label: 'Bottom' },
                { value: 'right', label: 'Right' },
              ]}
              value={s.legendPos}
              onChange={(v) => set({ legendPos: v as 'off' | 'bottom' | 'right' })}
              theme={theme}
            />
            {s.legendPos !== 'off' && (
              <ToggleGroup
                label="On click"
                options={[
                  { value: 'toggle', label: 'Show / Hide' },
                  { value: 'solo', label: 'Focus' },
                ]}
                value={s.legendMode}
                onChange={(v) => set({ legendMode: v as 'toggle' | 'solo' })}
                theme={theme}
              />
            )}
          </Section>
        </>
      )}
      codeConfig={(s) => ({
        theme: 'darkTheme',
        components: [
          {
            component: 'LineSeries',
            props: {
              data: 'data',
              options: {
                ...(s.areaFill ? { areaFill: true } : {}),
                ...(s.lineWidth !== 1 ? { lineWidth: s.lineWidth } : {}),
                ...(s.streaming ? { pulse: true } : {}),
                ...(s.stacking !== 'off' ? { stacking: s.stacking } : {}),
              },
            },
          },
          { component: 'Tooltip' },
          { component: 'Crosshair' },
          { component: 'YAxis' },
          { component: 'XAxis' },
        ],
      })}
    />
  );
}
