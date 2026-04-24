import { CandlestickSeries, ChartContainer, LineSeries, TimeAxis, Title, YAxis } from '@wick-charts/react';
import { useMemo } from 'react';

import {
  generateAllNegativeOHLC,
  generateConstantOHLC,
  generateHugeRangeLine,
  generateNearZeroLine,
  generateNegativeCrossingLine,
} from '../../data/stress';
import type { PanelCtx, StressPanel } from './panel';

function Constant({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => generateConstantOHLC(200, 100), []);
  return (
    <ChartContainer theme={theme} perf={perfHud} interactive={false}>
      <Title sub="min === max">Constant value</Title>
      <CandlestickSeries data={data} />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function NearZero({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => generateNearZeroLine(200, 1e-8), []);
  return (
    <ChartContainer theme={theme} perf={perfHud} interactive={false}>
      <Title sub="[1e-8, 2e-8]">Near-zero magnitudes</Title>
      <LineSeries data={[data]} />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function HugeRange({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => generateHugeRangeLine(200), []);
  return (
    <ChartContainer theme={theme} perf={perfHud} interactive={false}>
      <Title sub="1 → 1e9, linear axis">Giant range</Title>
      <LineSeries data={[data]} />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function NegativeCrossing({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => generateNegativeCrossingLine(200, 500), []);
  return (
    <ChartContainer theme={theme} perf={perfHud} interactive={false}>
      <Title sub="±500, crosses 0">Negative crossing</Title>
      <LineSeries data={[data]} options={{ area: { visible: true } }} />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function AllNegative({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => generateAllNegativeOHLC(200), []);
  return (
    <ChartContainer theme={theme} perf={perfHud} interactive={false}>
      <Title sub="fully-negative OHLC">All negative</Title>
      <CandlestickSeries data={data} />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

export const scalePanels: readonly StressPanel[] = [
  {
    id: 'scale-constant',
    title: 'Constant value',
    hint: 'All OHLC = 100. Min==max. Check axis doesn\'t collapse to a single tick.',
    render: (ctx) => <Constant {...ctx} />,
  },
  {
    id: 'scale-near-zero',
    title: 'Near-zero magnitudes',
    hint: 'Values in [1e-8, 2e-8]. Axis labels should format without overflow.',
    render: (ctx) => <NearZero {...ctx} />,
  },
  {
    id: 'scale-huge-range',
    title: 'Giant range',
    hint: '1 → 1e9 on a linear axis — small values compress to the floor.',
    render: (ctx) => <HugeRange {...ctx} />,
  },
  {
    id: 'scale-negative-crossing',
    title: 'Negative crossing zero',
    hint: 'Area fill should extend above and below the zero baseline cleanly.',
    render: (ctx) => <NegativeCrossing {...ctx} />,
  },
  {
    id: 'scale-all-negative',
    title: 'All-negative OHLC',
    hint: 'Inverts the usual mental model. Axis labels render with leading minus.',
    render: (ctx) => <AllNegative {...ctx} />,
  },
];
