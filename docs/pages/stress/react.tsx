import { useEffect, useMemo, useState } from 'react';

import { CandlestickSeries, ChartContainer, InfoBar, TimeAxis, Title, YAxis } from '@wick-charts/react';

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
    <ChartContainer theme={theme} perf={perfHud?.()} interactive={false}>
      <Title sub="new options object each render">Ref-identity stress</Title>
      {/* Literal inline `options` object — new reference each render, same content. */}
      <CandlestickSeries
        data={data}
        options={{
          up: { body: '#26a69a', wick: '#26a69a' },
          down: { body: '#ef5350', wick: '#ef5350' },
          bodyWidthRatio: 0.6,
        }}
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
    <ChartContainer theme={theme} perf={perfHud?.()} interactive={false}>
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
    <ChartContainer theme={theme} perf={perfHud?.()} interactive={false}>
      <Title sub="`.slice()` each render">Array identity stress</Title>
      <CandlestickSeries data={sliced} />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function HeaderFadeOverlap({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => generateOHLCData(150, 42_000), []);

  // Bare `fade` opts the top mask in: the zone spans the measured header +
  // 24px and half the header fold-in is released, so candle tops live
  // inside the dissolve at rest. The X mask under the price axis needs no
  // opt-in — it's the default everywhere.
  return (
    <ChartContainer theme={theme} perf={perfHud?.()} fade>
      <Title sub="data rides under the header and dissolves">Top fade</Title>
      <InfoBar />
      <CandlestickSeries data={data} />
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
  {
    id: 'react-top-fade',
    title: 'Top fade under the header',
    hint: 'Opt-in `fade` dissolves candles under Title/InfoBar; the X melt under the price axis when panning is on everywhere by default; `fade={false}` kills both.',
    render: (ctx) => <HeaderFadeOverlap {...ctx} />,
  },
];
