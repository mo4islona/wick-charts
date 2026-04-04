import { useState } from 'react';

import { ChartContainer, type ChartTheme, PieSeries, type PieSliceData, PieTooltip } from '@wick-charts/react';

import { Cell } from '../components/Cell';

const PORTFOLIO: PieSliceData[] = [
  { label: 'BTC', value: 42 },
  { label: 'ETH', value: 28 },
  { label: 'SOL', value: 12 },
  { label: 'AVAX', value: 8 },
  { label: 'DOT', value: 6 },
  { label: 'Other', value: 4 },
];

const REVENUE: PieSliceData[] = [
  { label: 'Subscriptions', value: 55 },
  { label: 'Trading fees', value: 25 },
  { label: 'Staking', value: 12 },
  { label: 'Other', value: 8 },
];

const CHAINS: PieSliceData[] = [
  { label: 'Ethereum', value: 58 },
  { label: 'Solana', value: 18 },
  { label: 'BSC', value: 10 },
  { label: 'Avalanche', value: 7 },
  { label: 'Polygon', value: 5 },
  { label: 'Other', value: 2 },
];

const ALLOCATION: PieSliceData[] = [
  { label: 'DeFi', value: 35 },
  { label: 'NFTs', value: 20 },
  { label: 'L1/L2', value: 25 },
  { label: 'Stablecoins', value: 15 },
  { label: 'Gaming', value: 5 },
];

function PieChart({ theme, data, donut }: { theme: ChartTheme; data: PieSliceData[]; donut?: boolean }) {
  const [sid, setSid] = useState<string | null>(null);
  return (
    <ChartContainer theme={theme} yAxisWidth={0} xAxisHeight={0}>
      <PieSeries
        data={data}
        onSeriesId={setSid}
        options={{ innerRadiusRatio: donut ? 0.55 : 0, padAngle: 0.03, strokeColor: theme.background, strokeWidth: 2 }}
      />
      {sid && <PieTooltip seriesId={sid} />}
    </ChartContainer>
  );
}

export function PiePage({ theme }: { theme: ChartTheme }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: 10,
        height: '100%',
        padding: 12,
      }}
    >
      <Cell label="Portfolio" sub="pie" theme={theme}>
        <PieChart theme={theme} data={PORTFOLIO} />
      </Cell>
      <Cell label="Revenue" sub="donut" theme={theme}>
        <PieChart theme={theme} data={REVENUE} donut />
      </Cell>
      <Cell label="Chains" sub="pie" theme={theme}>
        <PieChart theme={theme} data={CHAINS} />
      </Cell>
      <Cell label="Allocation" sub="donut" theme={theme}>
        <PieChart theme={theme} data={ALLOCATION} donut />
      </Cell>
    </div>
  );
}
