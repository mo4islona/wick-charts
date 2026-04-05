import { useState } from 'react';

import {
  ChartContainer,
  type ChartTheme,
  PieLegend,
  PieSeries,
  type PieSliceData,
  PieTooltip,
} from '@wick-charts/react';

import { Cell } from '../components/Cell';
import { Section, Switch } from '../components/controls';
import { Playground, type PlaygroundChartProps } from '../components/Playground';

interface PieSettings {
  donut: boolean;
  showTooltip: boolean;
  showLegend: boolean;
}

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

function PieChart({
  theme,
  data,
  donut,
  showTooltip,
  showLegend,
}: PlaygroundChartProps & PieSettings & { data: PieSliceData[] }) {
  const [sid, setSid] = useState<string | null>(null);
  return (
    <ChartContainer theme={theme} axis={{ y: { visible: false, width: 0 }, x: { visible: false, height: 0 } }}>
      <PieSeries
        data={data}
        onSeriesId={setSid}
        options={{ innerRadiusRatio: donut ? 0.55 : 0, padAngle: 0.03, strokeColor: theme.background, strokeWidth: 2 }}
      />
      {sid && showTooltip && <PieTooltip seriesId={sid} />}
      {sid && showLegend && <PieLegend seriesId={sid} />}
    </ChartContainer>
  );
}

export function PiePage({ theme }: { theme: ChartTheme }) {
  return (
    <Playground<PieSettings>
      id="pie"
      theme={theme}
      defaults={{ donut: false, showTooltip: true, showLegend: true }}
      gridTemplate="1fr 1fr"
      gridColumns="1fr 1fr"
      hideCartesian
      charts={(props) => (
        <>
          <Cell label="Portfolio" sub={props.donut ? 'donut' : 'pie'} theme={props.theme}>
            <PieChart {...props} data={PORTFOLIO} />
          </Cell>
          <Cell label="Revenue" sub={props.donut ? 'donut' : 'pie'} theme={props.theme}>
            <PieChart {...props} data={REVENUE} />
          </Cell>
          <Cell label="Chains" sub={props.donut ? 'donut' : 'pie'} theme={props.theme}>
            <PieChart {...props} data={CHAINS} />
          </Cell>
          <Cell label="Allocation" sub={props.donut ? 'donut' : 'pie'} theme={props.theme}>
            <PieChart {...props} data={ALLOCATION} />
          </Cell>
        </>
      )}
      settings={(s, set) => (
        <Section title="Series" theme={theme} noBorder>
          <Switch label="Donut" checked={s.donut} onChange={(v) => set({ donut: v })} theme={theme} />
          <Switch label="Tooltip" checked={s.showTooltip} onChange={(v) => set({ showTooltip: v })} theme={theme} />
          <Switch label="Legend" checked={s.showLegend} onChange={(v) => set({ showLegend: v })} theme={theme} />
        </Section>
      )}
      codeConfig={(s) => ({
        theme: 'darkTheme',
        components: [
          {
            component: 'PieSeries',
            props: { data: 'data', options: { innerRadiusRatio: s.donut ? 0.55 : 0, padAngle: 0.03 } },
          },
          ...(s.showTooltip ? [{ component: 'PieTooltip', props: { seriesId: 'sid' } }] : []),
          ...(s.showLegend ? [{ component: 'PieLegend', props: { seriesId: 'sid' } }] : []),
        ],
      })}
    />
  );
}
