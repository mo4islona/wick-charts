import { CandlestickSeries, ChartContainer, TimeAxis, Title, YAxis } from '@wick-charts/react';
import { useEffect, useMemo, useState } from 'react';

import { generateOHLCData } from '../../data';
import type { PanelCtx, StressPanel } from './panel';

function NewOptionsEveryRender({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => generateOHLCData(150, 42_000), []);
  // Re-render the panel 10×/s.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, []);

  return (
    <ChartContainer theme={theme} perf={perfHud} interactive={false}>
      <Title sub="new options object each render">Ref-identity stress</Title>
      {/* Literal inline `options` object — new reference each render, same content. */}
      <CandlestickSeries
        data={data}
        options={{ up: { body: '#26a69a', wick: '#26a69a' }, down: { body: '#ef5350', wick: '#ef5350' }, bodyWidthRatio: 0.6 }}
      />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function SeriesIdChurn({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => generateOHLCData(150, 42_000), []);
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setEpoch((e) => e + 1), 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <ChartContainer theme={theme} perf={perfHud} interactive={false}>
      <Title sub={`remount every 2s · ep ${epoch}`}>Series id churn</Title>
      <CandlestickSeries key={epoch} id={`candle-${epoch}`} data={data} />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function NewDataArrayEveryRender({ theme, perfHud }: PanelCtx) {
  const base = useMemo(() => generateOHLCData(200, 42_000), []);
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, []);
  // Same content, new array reference on every render.
  const sliced = base.slice();

  return (
    <ChartContainer theme={theme} perf={perfHud} interactive={false}>
      <Title sub="`.slice()` each render">Array identity stress</Title>
      <CandlestickSeries data={sliced} />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

export const reactPanels: readonly StressPanel[] = [
  {
    id: 'react-options-ref',
    title: 'New options object every render',
    hint: 'Re-renders 10/s with inline options. Perf HUD on — draw-calls should stay flat (no spurious updateSeriesOptions).',
    render: (ctx) => <NewOptionsEveryRender {...ctx} />,
  },
  {
    id: 'react-id-churn',
    title: 'Series id churn',
    hint: 'Remounts under a new id every 2s. Watch for leaks or flicker.',
    render: (ctx) => <SeriesIdChurn {...ctx} />,
  },
  {
    id: 'react-data-ref',
    title: 'New data array every render',
    hint: 'Same content, new array ref each render. Smart-diff should short-circuit to no-op.',
    render: (ctx) => <NewDataArrayEveryRender {...ctx} />,
  },
];
