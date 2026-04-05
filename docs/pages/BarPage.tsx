import { useMemo } from 'react';

import {
  type AxisConfig,
  BarSeries,
  type BarStacking,
  ChartContainer,
  type ChartTheme,
  Crosshair,
  Legend,
  type LineData,
  Tooltip,
  XAxis,
  YAxis,
} from '@wick-charts/react';

import { Cell } from '../components/Cell';
import { Section, ToggleGroup } from '../components/controls';
import { Playground, type PlaygroundChartProps } from '../components/Playground';
import { generateBarData } from '../data';
import { useLineStreams } from '../hooks';

type BarWidth = 'thin' | 'normal' | 'wide';
const BAR_WIDTH_MAP: Record<BarWidth, number> = { thin: 0.3, normal: 0.6, wide: 0.85 };
const LAYER_COUNT = 4;

interface BarSettings {
  stacking: BarStacking;
  barWidth: BarWidth;
}

function genLayer(count: number, base: number, interval: number): LineData[] {
  const data: LineData[] = [];
  const now = Math.floor(Date.now() / 1000);
  const start = now - count * interval;
  for (let i = 0; i < count; i++) {
    data.push({ time: start + i * interval, value: Math.round(base + Math.random() * base * 0.8) });
  }
  return data;
}

const singleData = generateBarData(80, 240);
const layers = Array.from({ length: LAYER_COUNT }, (_, i) => genLayer(80, [60, 40, 25, 15][i], 240));

function SingleBarChart(props: PlaygroundChartProps & BarSettings) {
  const { datasets } = useLineStreams([singleData], 300);
  const display = props.streaming ? datasets[0] : singleData;
  return (
    <ChartContainer theme={props.theme} axis={props.axis}>
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

function MultiBarChart(props: PlaygroundChartProps & BarSettings) {
  const { datasets } = useLineStreams(layers, 500);
  const display = props.streaming ? datasets : layers;
  const chartAxis = useMemo<AxisConfig>(() => {
    if (props.stacking === 'off') return { ...props.axis, y: { min: 0, ...props.axis?.y } };
    return props.axis ?? {};
  }, [props.axis, props.stacking]);
  return (
    <ChartContainer theme={props.theme} axis={chartAxis}>
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
            <Cell label="Single" sub="Up/Down" theme={props.theme}>
              <SingleBarChart key={`s-${props.streaming}`} {...props} />
            </Cell>
            <Cell label={label} sub={`${LAYER_COUNT} layers`} theme={props.theme}>
              <MultiBarChart key={`m-${props.streaming}-${props.stacking}`} {...props} />
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
