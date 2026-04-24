import { ChartContainer, PieLegend, PieSeries, type PieSliceData, PieTooltip, Title } from '@wick-charts/react';
import { useMemo } from 'react';

import { manyPieSlices, poisonedPieSlices } from '../../data/stress';
import type { PanelCtx, StressPanel } from './panel';

function ZeroTotal({ theme, perfHud }: PanelCtx) {
  const data: PieSliceData[] = useMemo(
    () => [
      { label: 'A', value: 0 },
      { label: 'B', value: 0 },
      { label: 'C', value: 0 },
    ],
    [],
  );
  return (
    <ChartContainer theme={theme} perf={perfHud} interactive={false}>
      <Title sub="all values 0">Zero-total</Title>
      <PieSeries id="pie-zero" data={data} />
      <PieLegend seriesId="pie-zero" />
    </ChartContainer>
  );
}

function SingleDominant({ theme, perfHud }: PanelCtx) {
  const data: PieSliceData[] = useMemo(
    () => [
      { label: 'Total', value: 100 },
      { label: 'Empty 1', value: 0 },
      { label: 'Empty 2', value: 0 },
    ],
    [],
  );
  return (
    <ChartContainer theme={theme} perf={perfHud} interactive={false}>
      <Title sub="100% in one slice">Single dominant</Title>
      <PieSeries id="pie-single" data={data} />
      <PieLegend seriesId="pie-single" />
      <PieTooltip seriesId="pie-single" />
    </ChartContainer>
  );
}

function ManySlices({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => manyPieSlices(100), []);
  return (
    <ChartContainer theme={theme} perf={perfHud} interactive={false}>
      <Title sub="100 tiny slices">Many slices</Title>
      <PieSeries id="pie-many" data={data} />
      <PieLegend seriesId="pie-many" position="right" />
    </ChartContainer>
  );
}

function Poisoned({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => poisonedPieSlices(), []);
  return (
    <ChartContainer theme={theme} perf={perfHud} interactive={false}>
      <Title sub="negative + NaN + Infinity">Poisoned values</Title>
      <PieSeries id="pie-bad" data={data} />
      <PieLegend seriesId="pie-bad" />
      <PieTooltip seriesId="pie-bad" />
    </ChartContainer>
  );
}

function NearlyFull({ theme, perfHud }: PanelCtx) {
  const data: PieSliceData[] = useMemo(
    () => [
      { label: 'Dominant', value: 99.99 },
      { label: 'Residual', value: 0.01 },
    ],
    [],
  );
  return (
    <ChartContainer theme={theme} perf={perfHud} interactive={false}>
      <Title sub="99.99% dominant">Dominant + residual</Title>
      <PieSeries id="pie-99" data={data} />
      <PieLegend seriesId="pie-99" />
    </ChartContainer>
  );
}

export const piePanels: readonly StressPanel[] = [
  {
    id: 'pie-zero-total',
    title: 'Zero-total',
    hint: 'Divide-by-zero guard. Expect an empty wheel or degenerate render, not a crash.',
    render: (ctx) => <ZeroTotal {...ctx} />,
  },
  {
    id: 'pie-single-dominant',
    title: 'Single 100% slice',
    hint: 'One slice fills the ring; tooltip should still work on hover.',
    render: (ctx) => <SingleDominant {...ctx} />,
  },
  {
    id: 'pie-many-slices',
    title: '100 tiny slices',
    hint: 'Labels may collide. Legend column is the escape hatch.',
    render: (ctx) => <ManySlices {...ctx} />,
  },
  {
    id: 'pie-poisoned',
    title: 'Poisoned values',
    hint: 'Negative, NaN, Infinity — renderer must filter, not propagate NaN into totals.',
    render: (ctx) => <Poisoned {...ctx} />,
  },
  {
    id: 'pie-nearly-full',
    title: 'Dominant + residual',
    hint: '99.99 / 0.01. Small slice must be drawable (≥ 1 px arc).',
    render: (ctx) => <NearlyFull {...ctx} />,
  },
];
