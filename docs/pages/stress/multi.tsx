import {
  BarSeries,
  CandlestickSeries,
  ChartContainer,
  Crosshair,
  LineSeries,
  TimeAxis,
  Title,
  Tooltip,
  YAxis,
  resolveCandlestickBodyColor,
} from '@wick-charts/react';
import { useMemo } from 'react';

import { generateBandLine, generateBarData, generateOHLCData, generateWaveData } from '../../data';
import { ema, sma } from '../../data/stress';
import type { PanelCtx, StressPanel } from './panel';

function CandleWithMAs({ theme, perfHud }: PanelCtx) {
  const ohlc = useMemo(() => generateOHLCData(300, 42_000), []);
  const sma20 = useMemo(() => sma(ohlc, 20), [ohlc]);
  const ema50 = useMemo(() => ema(ohlc, 50), [ohlc]);
  return (
    <ChartContainer theme={theme} perf={perfHud} interactive={false}>
      <Title sub="SMA20 + EMA50">Candle + moving averages</Title>
      <CandlestickSeries data={ohlc} />
      <LineSeries
        data={[sma20]}
        options={{ colors: ['#ffd700'], strokeWidth: 1, area: { visible: false }, pulse: false, label: 'SMA 20' }}
      />
      <LineSeries
        data={[ema50]}
        options={{ colors: ['#ff6b6b'], strokeWidth: 1, area: { visible: false }, pulse: false, label: 'EMA 50' }}
      />
      <Tooltip />
      <Crosshair />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function CandleWithBarVolume({ theme, perfHud }: PanelCtx) {
  const ohlc = useMemo(() => generateOHLCData(200, 42_000), []);
  const volume = useMemo(
    () => ohlc.map((c) => ({ time: c.time, value: c.volume ?? 0 })),
    [ohlc],
  );
  const upBase = resolveCandlestickBodyColor(theme.candlestick.up.body);
  return (
    <ChartContainer theme={theme} perf={perfHud} interactive={false}>
      <Title sub="bar series layered under">Candle + bar volume overlay</Title>
      <BarSeries data={[volume]} options={{ colors: [upBase], barWidthRatio: 0.4 }} />
      <CandlestickSeries data={ohlc} />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function StackedBarsTrend({ theme, perfHud }: PanelCtx) {
  const layers = useMemo(() => [generateBarData(120), generateBarData(120), generateBarData(120)], []);
  const trend = useMemo(() => generateWaveData(120, { amplitude: 400, period: 50, base: 200 }), []);
  return (
    <ChartContainer theme={theme} perf={perfHud} interactive={false}>
      <Title sub="3 stacked + line">Stacked bars + trend</Title>
      <BarSeries data={layers} options={{ stacking: 'normal' }} />
      <LineSeries data={[trend]} options={{ area: { visible: false }, strokeWidth: 2 }} />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function BollingerBands({ theme, perfHud }: PanelCtx) {
  const ohlc = useMemo(() => generateOHLCData(200, 42_000), []);
  const upper = useMemo(() => generateBandLine(ohlc, 0.03), [ohlc]);
  const lower = useMemo(() => generateBandLine(ohlc, -0.03), [ohlc]);
  return (
    <ChartContainer theme={theme} perf={perfHud} interactive={false}>
      <Title sub="candle + upper/lower bands">OHLC + Bollinger</Title>
      <LineSeries
        data={[upper, lower]}
        options={{
          colors: [theme.bands.upper, theme.bands.lower],
          area: { visible: false },
          strokeWidth: 1,
          pulse: false,
        }}
      />
      <CandlestickSeries data={ohlc} />
      <Crosshair />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

export const multiPanels: readonly StressPanel[] = [
  {
    id: 'multi-ma',
    title: 'Candle + SMA + EMA',
    hint: 'Two line indicators laid over an OHLC series. Legends/tooltip should carry all three.',
    render: (ctx) => <CandleWithMAs {...ctx} />,
  },
  {
    id: 'multi-vol',
    title: 'Candle + bar volume',
    hint: 'Bar series beneath candles. Z-order correct means bars don\'t occlude bodies.',
    render: (ctx) => <CandleWithBarVolume {...ctx} />,
  },
  {
    id: 'multi-bars-trend',
    title: 'Stacked bars + trend line',
    hint: '3-layer stack with a line overlay — shared y-axis scale.',
    render: (ctx) => <StackedBarsTrend {...ctx} />,
  },
  {
    id: 'multi-bollinger',
    title: 'OHLC + Bollinger bands',
    hint: 'Two line series derived from OHLC via bandStrategy.',
    render: (ctx) => <BollingerBands {...ctx} />,
  },
];
