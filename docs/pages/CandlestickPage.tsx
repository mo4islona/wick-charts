import {
  CandlestickSeries,
  ChartContainer,
  type ChartTheme,
  Crosshair,
  type OHLCData,
  Title,
  Tooltip,
  TooltipLegend,
  XAxis,
  YAxis,
  YLabel,
} from '@wick-charts/react';

import { Cell } from '../components/Cell';
import { Section, Switch } from '../components/controls';
import { Playground, type PlaygroundChartProps } from '../components/Playground';
import { generateOHLCData } from '../data';
import { DEMO_INTERVAL } from '../data/demo';
import { useOHLCStream } from '../hooks';

interface CandleSettings {
  showYLabel: boolean;
  showTooltip: boolean;
  showTooltipLegend: boolean;
  candleGradient: boolean;
}

const steadyData = generateOHLCData(300, 42000, DEMO_INTERVAL);
const volatileData = generateOHLCData(300, 100, DEMO_INTERVAL);
const trendingData = generateOHLCData(300, 1500, DEMO_INTERVAL);

function CandleChart({
  theme,
  axis,
  streaming,
  gradient,
  data,
  showYLabel,
  showTooltip,
  showTooltipLegend,
  candleGradient,
  candleEnterAnimation,
  enterDurationMs,
  liveTracking,
  startDelay,
  title,
  sub,
}: PlaygroundChartProps & CandleSettings & { data: OHLCData[]; startDelay: number; title: string; sub: string }) {
  // speed=5: virtual interval is 5s so each candle forms with visible intra
  // wobble, but wall-clock gives us one new bar per second — dense enough
  // for entrance animations to feel continuous, like the dashboard.
  const { data: d } = useOHLCStream(data, { startDelay, interval: DEMO_INTERVAL, speed: 5 });
  const display = streaming ? d : data;
  const sid = 'candle';
  return (
    <ChartContainer theme={theme} axis={axis} gradient={gradient}>
      <Title sub={sub}>{title}</Title>
      {showTooltipLegend && <TooltipLegend seriesId={sid} />}
      <CandlestickSeries
        id={sid}
        data={display}
        options={{
          candleGradient,
          enterAnimation: candleEnterAnimation,
          enterDurationMs,
          liveSmoothRate: liveTracking ? undefined : 0,
        }}
      />
      {showYLabel && <YLabel seriesId={sid} />}
      {showTooltip && <Tooltip seriesId={sid} />}
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
      defaults={{ showYLabel: true, showTooltip: true, showTooltipLegend: true, candleGradient: true }}
      gridTemplate="1fr 1fr 1fr"
      animationKinds={['candle']}
      charts={(props) => (
        <>
          <Cell theme={props.theme}>
            <CandleChart
              key={`s-${props.streaming}`}
              {...props}
              data={steadyData}
              startDelay={300}
              title="BTC/USD"
              sub="Standard · 1m"
            />
          </Cell>
          <Cell theme={props.theme}>
            <CandleChart
              key={`v-${props.streaming}`}
              {...props}
              data={volatileData}
              startDelay={400}
              title="DOGE/USD"
              sub="High volatility · 1m"
            />
          </Cell>
          <Cell theme={props.theme}>
            <CandleChart
              key={`t-${props.streaming}`}
              {...props}
              data={trendingData}
              startDelay={500}
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
            label="Info bar"
            checked={s.showTooltipLegend}
            onChange={(v) => set({ showTooltipLegend: v })}
            theme={theme}
          />
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
          { component: 'CandlestickSeries', props: { id: 'sid', data: 'ohlcData' } },
          ...(s.showTooltipLegend ? [{ component: 'TooltipLegend', props: { seriesId: 'sid' } }] : []),
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
