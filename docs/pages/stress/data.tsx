import {
  BarSeries,
  CandlestickSeries,
  ChartContainer,
  LineSeries,
  TimeAxis,
  Title,
  Tooltip,
  YAxis,
  YLabel,
} from '@wick-charts/react';
import { useMemo } from 'react';

import { generateOHLCData } from '../../data';
import {
  generateBarWithNulls,
  generateDuplicateTimestampOHLC,
  generateGappedOHLC,
  generateLineWithNulls,
  generateOHLCWithNanInfinity,
  generateOHLCWithNulls,
  generateUnsortedOHLC,
} from '../../data/stress';
import type { PanelCtx, StressPanel } from './panel';

function Empty({ theme, perfHud }: PanelCtx) {
  return (
    <ChartContainer theme={theme} perf={perfHud} interactive={false}>
      <Title sub="data=[]">Empty</Title>
      <CandlestickSeries data={[]} />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function SinglePoint({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => generateOHLCData(1, 42_000), []);

  return (
    <ChartContainer theme={theme} perf={perfHud} interactive={false}>
      <Title sub="one candle">Single point</Title>
      <CandlestickSeries id="single" data={data} />
      <YLabel seriesId="single" />
      <Tooltip />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function Nulls({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => generateOHLCWithNulls(300, 42_000, 0.15), []);
  return (
    <ChartContainer theme={theme} perf={perfHud} interactive={false}>
      <Title sub="15% of points have a null field">Nulls in OHLC</Title>
      <CandlestickSeries data={data} />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function LineNulls({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => generateLineWithNulls(300, 0.2), []);
  return (
    <ChartContainer theme={theme} perf={perfHud} interactive={false}>
      <Title sub="20% of values = null / NaN / Infinity / undefined">Nulls in line</Title>
      <LineSeries data={[data]} />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function BarNulls({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => generateBarWithNulls(200, 0.2), []);
  return (
    <ChartContainer theme={theme} perf={perfHud} interactive={false}>
      <Title sub="20% of values = null / NaN / -Infinity / undefined">Nulls in bar</Title>
      <BarSeries data={[data]} />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function NanInfinity({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => generateOHLCWithNanInfinity(300, 42_000), []);
  return (
    <ChartContainer theme={theme} perf={perfHud} interactive={false}>
      <Title sub="every 7th candle is poisoned">NaN / Infinity</Title>
      <CandlestickSeries data={data} />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function DuplicateTimestamps({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => generateDuplicateTimestampOHLC(300), []);
  return (
    <ChartContainer theme={theme} perf={perfHud} interactive={false}>
      <Title sub="two candles share time[1]">Duplicate timestamps</Title>
      <CandlestickSeries data={data} />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function Unsorted({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => generateUnsortedOHLC(300), []);
  return (
    <ChartContainer theme={theme} perf={perfHud} interactive={false}>
      <Title sub="reversed input">Unsorted input</Title>
      <CandlestickSeries data={data} />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function Gapped({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => generateGappedOHLC(300, 120, 50), []);
  return (
    <ChartContainer theme={theme} perf={perfHud} interactive={false}>
      <Title sub="50-bar hole mid-range">Gapped</Title>
      <CandlestickSeries data={data} />
      <LineSeries data={[data.map((c) => ({ time: c.time, value: c.close }))]} options={{ area: { visible: false } }} />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

export const dataPanels: readonly StressPanel[] = [
  {
    id: 'data-empty',
    title: 'Empty data',
    hint: 'Axes render, no crash, no console errors.',
    render: (ctx) => <Empty {...ctx} />,
  },
  {
    id: 'data-single',
    title: 'Single point',
    hint: 'Axis auto-range with n=1. Hover the candle to check tooltip pick.',
    render: (ctx) => <SinglePoint {...ctx} />,
  },
  {
    id: 'data-nulls',
    title: 'Nulls in OHLC',
    hint: 'Poisoned fields (close=null, volume=null). Renderer must skip, not crash.',
    render: (ctx) => <Nulls {...ctx} />,
  },
  {
    id: 'data-line-nulls',
    title: 'Nulls in line',
    hint: '1 in 5 points has value = null / NaN / Infinity / undefined. Line should break at the gap, not NaN-out the axis.',
    render: (ctx) => <LineNulls {...ctx} />,
  },
  {
    id: 'data-bar-nulls',
    title: 'Nulls in bar',
    hint: 'Bar renderer must skip poisoned values; remaining bars layout normally.',
    render: (ctx) => <BarNulls {...ctx} />,
  },
  {
    id: 'data-nan-infinity',
    title: 'NaN / Infinity',
    hint: 'Non-finite values scattered. Watch for NaN leaking into axis labels.',
    render: (ctx) => <NanInfinity {...ctx} />,
  },
  {
    id: 'data-dup-time',
    title: 'Duplicate timestamps',
    hint: 'time[1] === time[2]. Store should dedupe or render both without glitching.',
    render: (ctx) => <DuplicateTimestamps {...ctx} />,
  },
  {
    id: 'data-unsorted',
    title: 'Unsorted input',
    hint: 'Reversed array (newest first). Store must re-sort or reject.',
    render: (ctx) => <Unsorted {...ctx} />,
  },
  {
    id: 'data-gapped',
    title: 'Time gap',
    hint: '300 bars with a 50-bar hole in the middle. Line overlay exposes the gap.',
    render: (ctx) => <Gapped {...ctx} />,
  },
];
