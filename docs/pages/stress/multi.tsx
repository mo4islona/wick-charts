import { useMemo } from 'react';

import {
  BandSeries,
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

import { generateBarData, generateOHLCData, generateWaveData } from '../../data';
import { bollinger, ema, sma } from '../../data/stress';
import type { PanelCtx, StressPanel } from './panel';

function CandleWithMAs({ theme, perfHud }: PanelCtx) {
  const ohlc = useMemo(() => generateOHLCData(300, 42_000), []);
  const sma20 = useMemo(() => sma(ohlc, 20), [ohlc]);
  const ema50 = useMemo(() => ema(ohlc, 50), [ohlc]);
  return (
    <ChartContainer theme={theme} perf={perfHud?.()} interactive={false}>
      <Title sub="SMA20 + EMA50">Candle + moving averages</Title>
      <CandlestickSeries data={ohlc} />
      <LineSeries
        data={{ label: 'SMA 20', color: '#ffd700', data: sma20 }}
        options={{ strokeWidth: 1, area: { visible: false }, pulse: false }}
      />
      <LineSeries
        data={{ label: 'EMA 50', color: '#ff6b6b', data: ema50 }}
        options={{ strokeWidth: 1, area: { visible: false }, pulse: false }}
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
  const volume = useMemo(() => ohlc.map((c) => ({ time: c.time, value: c.volume ?? 0 })), [ohlc]);
  const upBase = resolveCandlestickBodyColor(theme.candlestick.up.body);
  return (
    <ChartContainer theme={theme} perf={perfHud?.()} interactive={false}>
      <Title sub="bar series layered under">Candle + bar volume overlay</Title>
      <BarSeries data={{ color: upBase, data: volume }} options={{ barWidthRatio: 0.4 }} />
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
    <ChartContainer theme={theme} perf={perfHud?.()} interactive={false}>
      <Title sub="3 stacked + line">Stacked bars + trend</Title>
      <BarSeries data={layers} options={{ stacking: 'normal' }} />
      <LineSeries data={[trend]} options={{ area: { visible: false }, strokeWidth: 2 }} />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

const BOLLINGER_PERIOD = 20;

function BollingerBands({ theme, perfHud }: PanelCtx) {
  // The leading candles only warm up the first band window, so the band starts with the candles.
  const history = useMemo(() => generateOHLCData(200 + BOLLINGER_PERIOD - 1, 42_000), []);
  const ohlc = useMemo(() => history.slice(BOLLINGER_PERIOD - 1), [history]);
  const band = useMemo(() => bollinger(history, BOLLINGER_PERIOD), [history]);

  return (
    <ChartContainer theme={theme} perf={perfHud?.()} interactive={false}>
      <Title sub="band series under candles">OHLC + Bollinger</Title>
      <BandSeries data={{ label: 'Bollinger 20, 2σ', data: band }} />
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
    hint: "Bar series beneath candles. Z-order correct means bars don't occlude bodies.",
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
    hint: 'One BandSeries (SMA 20 ± 2σ) under the candles. The fill spans only between the edges, never to the floor, and the Y range covers both edges.',
    render: (ctx) => <BollingerBands {...ctx} />,
  },
];
