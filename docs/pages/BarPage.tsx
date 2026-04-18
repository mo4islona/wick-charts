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
import { Section, ToggleGroup } from '../components/controls';
import { Playground, type PlaygroundChartProps } from '../components/Playground';
import { generateBarData, generateLayerData } from '../data';
import { useLineStreams } from '../hooks';

type BarWidth = 'thin' | 'normal' | 'wide';
const BAR_WIDTH_MAP: Record<BarWidth, number> = { thin: 0.3, normal: 0.6, wide: 0.85 };
const LAYER_COUNT = 4;

interface BarSettings {
  stacking: BarStacking;
  barWidth: BarWidth;
}

const singleData = generateBarData(80, 240);
const layers = Array.from({ length: LAYER_COUNT }, (_, i) => generateLayerData(80, [60, 40, 25, 15][i], 240));

function SingleBarChart(props: PlaygroundChartProps & BarSettings) {
  const { datasets } = useLineStreams([singleData], { delay: 300, interval: 240, kind: 'bar' });
  const display = props.streaming ? datasets[0] : singleData;
  return (
    <ChartContainer theme={props.theme} axis={props.axis} gradient={props.gradient}>
      <Title sub="Up/Down">Single</Title>
      <TooltipLegend />
      <BarSeries
        data={[display]}
        options={{
          colors: [props.theme.candlestick.upColor, props.theme.candlestick.downColor],
          barWidthRatio: BAR_WIDTH_MAP[props.barWidth],
          stacking: 'off',
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
  const { datasets } = useLineStreams(layers, { delay: 500, interval: 240, kind: 'layer' });
  const display = props.streaming ? datasets : layers;
  const chartAxis = useMemo<AxisConfig>(() => {
    if (props.stacking === 'off') return { ...props.axis, y: { min: 0, ...props.axis?.y } };
    return props.axis ?? {};
  }, [props.axis, props.stacking]);
  return (
    <ChartContainer theme={props.theme} axis={chartAxis} gradient={props.gradient}>
      <Title sub={`${LAYER_COUNT} layers`}>{props.title}</Title>
      <BarSeries
        data={display}
        options={{
          colors: props.theme.seriesColors.slice(0, display.length),
          barWidthRatio: BAR_WIDTH_MAP[props.barWidth],
          stacking: props.stacking,
        }}
      />
      <Tooltip legend={false} />
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
      defaults={{ stacking: 'normal', barWidth: 'normal' }}
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
