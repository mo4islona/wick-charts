import { useState } from 'react';

import {
  CandlestickSeries,
  ChartContainer,
  type ChartTheme,
  Crosshair,
  type OHLCData,
  Title,
  Tooltip,
  XAxis,
  YAxis,
  YLabel,
} from '@wick-charts/react';

import { Cell } from '../components/Cell';
import { Section, Switch } from '../components/controls';
import { Playground, type PlaygroundChartProps } from '../components/Playground';
import { generateOHLCData } from '../data';
import { useOHLCStream } from '../hooks';

interface CandleSettings {
  showYLabel: boolean;
  showTooltip: boolean;
  candleGradient: boolean;
}

const steadyData = generateOHLCData(300, 42000, 60);
const volatileData = generateOHLCData(300, 100, 60);
const trendingData = generateOHLCData(300, 1500, 60);

function CandleChart({
  theme,
  axis,
  streaming,
  gradient,
  data,
  showYLabel,
  showTooltip,
  candleGradient,
  interval,
  title,
  sub,
}: PlaygroundChartProps & CandleSettings & { data: OHLCData[]; interval: number; title: string; sub: string }) {
  const { data: d } = useOHLCStream(data, { delay: interval });
  const display = streaming ? d : data;
  const [sid, setSid] = useState<string | null>(null);
  return (
    <ChartContainer theme={theme} axis={axis} gradient={gradient}>
      <Title sub={sub}>{title}</Title>
      <CandlestickSeries data={display} onSeriesId={setSid} options={{ candleGradient }} />
      {sid && showYLabel && <YLabel seriesId={sid} />}
      {sid && showTooltip && <Tooltip seriesId={sid} />}
      <Crosshair />
      {axis?.y?.visible !== false && <YAxis />}
      {axis?.x?.visible !== false && <XAxis />}
    </ChartContainer>
  );
}

export function CandlestickPage({ theme }: { theme: ChartTheme }) {
  return (
    <Playground<CandleSettings>
      id="candlestick"
      theme={theme}
      defaults={{ showYLabel: true, showTooltip: true, candleGradient: true }}
      gridTemplate="1fr 1fr 1fr"
      charts={(props) => (
        <>
          <Cell theme={props.theme}>
            <CandleChart
              key={`s-${props.streaming}`}
              {...props}
              data={steadyData}
              interval={300}
              title="BTC/USD"
              sub="Standard · 1m"
            />
          </Cell>
          <Cell theme={props.theme}>
            <CandleChart
              key={`v-${props.streaming}`}
              {...props}
              data={volatileData}
              interval={400}
              title="DOGE/USD"
              sub="High volatility · 1m"
            />
          </Cell>
          <Cell theme={props.theme}>
            <CandleChart
              key={`t-${props.streaming}`}
              {...props}
              data={trendingData}
              interval={500}
              title="ETH/USD"
              sub="Trending · 1m"
            />
          </Cell>
        </>
      )}
      settings={(s, set) => (
        <Section title="Series" theme={theme} noBorder>
          <Switch label="Price label" checked={s.showYLabel} onChange={(v) => set({ showYLabel: v })} theme={theme} />
          <Switch label="Tooltip" checked={s.showTooltip} onChange={(v) => set({ showTooltip: v })} theme={theme} />
          <Switch
            label="Gradient"
            checked={s.candleGradient}
            onChange={(v) => set({ candleGradient: v })}
            theme={theme}
          />
        </Section>
      )}
      codeConfig={(s) => ({
        theme: 'darkTheme',
        components: [
          { component: 'CandlestickSeries', props: { data: 'ohlcData' } },
          ...(s.showYLabel ? [{ component: 'YLabel', props: { seriesId: 'sid' } }] : []),
          ...(s.showTooltip ? [{ component: 'Tooltip', props: { seriesId: 'sid' } }] : []),
          { component: 'Crosshair' },
          { component: 'YAxis' },
          { component: 'XAxis' },
        ],
      })}
    />
  );
}
