import { useMemo } from 'react';

import {
  type AxisConfig,
  BarSeries,
  type BarStacking,
  ChartContainer,
  type ChartTheme,
  Crosshair,
  Legend,
  Title,
  Tooltip,
  TooltipLegend,
  XAxis,
  YAxis,
} from '@wick-charts/react';

import { Cell } from '../components/Cell';
import { Section, Switch, ToggleGroup } from '../components/controls';
import { Playground, type PlaygroundChartProps } from '../components/Playground';
import { generateBarData, generateLayerData } from '../data';
import { DEMO_INTERVAL } from '../data/demo';
import { useLineStreams } from '../hooks';

type BarWidth = 'thin' | 'normal' | 'wide';
const BAR_WIDTH_MAP: Record<BarWidth, number> = { thin: 0.3, normal: 0.6, wide: 0.85 };
const LAYER_COUNT = 4;

interface BarSettings {
  stacking: BarStacking;
  barWidth: BarWidth;
  showTooltipLegend: boolean;
}

const singleData = generateBarData(80, DEMO_INTERVAL);
const layers = Array.from({ length: LAYER_COUNT }, (_, i) => generateLayerData(80, [60, 40, 25, 15][i], DEMO_INTERVAL));

function SingleBarChart(props: PlaygroundChartProps & BarSettings) {
  // speed=5 matches the other playground pages (see CandlestickPage) so new
  // bars append about once per second and the entry animations stay visible.
  const { datasets } = useLineStreams([singleData], {
    startDelay: 300,
    interval: DEMO_INTERVAL,
    speed: 5,
    kind: 'bar',
  });
  const display = props.streaming ? datasets[0] : singleData;
  return (
    <ChartContainer theme={props.theme} axis={props.axis} gradient={props.gradient} headerLayout={props.headerLayout}>
      <Title sub="Up/Down">Single</Title>
      {props.showTooltipLegend && <TooltipLegend />}
      <BarSeries
        data={[display]}
        options={{
          colors: [props.theme.candlestick.upColor, props.theme.candlestick.downColor],
          barWidthRatio: BAR_WIDTH_MAP[props.barWidth],
          stacking: 'off',
          enterAnimation: props.barEnterAnimation,
          enterDurationMs: props.enterDurationMs,
          liveSmoothRate: props.liveTracking ? undefined : 0,
        }}
      />
      <Tooltip />
      <Crosshair />
      {props.axis?.y?.visible !== false && <YAxis />}
      {props.axis?.x?.visible !== false && <XAxis />}
    </ChartContainer>
  );
}

function MultiBarChart(props: PlaygroundChartProps & BarSettings & { title: string }) {
  const { datasets } = useLineStreams(layers, {
    startDelay: 500,
    interval: DEMO_INTERVAL,
    speed: 5,
    kind: 'layer',
  });
  const display = props.streaming ? datasets : layers;
  const chartAxis = useMemo<AxisConfig>(() => {
    if (props.stacking === 'off') return { ...props.axis, y: { min: 0, ...props.axis?.y } };
    return props.axis ?? {};
  }, [props.axis, props.stacking]);
  return (
    <ChartContainer theme={props.theme} axis={chartAxis} gradient={props.gradient} headerLayout={props.headerLayout}>
      <Title sub={`${LAYER_COUNT} layers`}>{props.title}</Title>
      {props.showTooltipLegend && <TooltipLegend />}
      <BarSeries
        data={display}
        options={{
          colors: props.theme.seriesColors.slice(0, display.length),
          barWidthRatio: BAR_WIDTH_MAP[props.barWidth],
          stacking: props.stacking,
          enterAnimation: props.barEnterAnimation,
          enterDurationMs: props.enterDurationMs,
          liveSmoothRate: props.liveTracking ? undefined : 0,
        }}
      />
      <Tooltip />
      <Crosshair />
      {props.axis?.y?.visible !== false && <YAxis />}
      {props.axis?.x?.visible !== false && <XAxis />}
      <Legend />
    </ChartContainer>
  );
}

export function BarPage({ theme }: { theme: ChartTheme }) {
  return (
    <Playground<BarSettings>
      id="bar"
      theme={theme}
      defaults={{ stacking: 'normal', barWidth: 'normal', showTooltipLegend: true }}
      animationKinds={['bar']}
      charts={(props) => {
        const label = props.stacking === 'off' ? 'Overlapping' : props.stacking === 'normal' ? 'Stacked' : '100%';
        return (
          <>
            <Cell theme={props.theme}>
              <SingleBarChart key={`s-${props.streaming}`} {...props} />
            </Cell>
            <Cell theme={props.theme}>
              <MultiBarChart key={`m-${props.streaming}-${props.stacking}`} {...props} title={label} />
            </Cell>
          </>
        );
      }}
      settings={(s, set) => (
        <Section title="Series" theme={theme} noBorder>
          <ToggleGroup
            label="Width"
            options={[
              { value: 'thin', label: 'Thin' },
              { value: 'normal', label: 'Normal' },
              { value: 'wide', label: 'Wide' },
            ]}
            value={s.barWidth}
            onChange={(v) => set({ barWidth: v as BarWidth })}
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
          <Switch
            label="Info bar"
            checked={s.showTooltipLegend}
            onChange={(v) => set({ showTooltipLegend: v })}
            theme={theme}
          />
        </Section>
      )}
      codeConfig={(s) => ({
        theme: 'darkTheme',
        components: [
          {
            component: 'BarSeries',
            props: { data: 'layers', options: { barWidthRatio: BAR_WIDTH_MAP[s.barWidth], stacking: s.stacking } },
          },
          { component: 'Crosshair' },
          { component: 'YAxis' },
          { component: 'XAxis' },
        ],
      })}
    />
  );
}
