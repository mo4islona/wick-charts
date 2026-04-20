import {
  ChartContainer,
  type ChartTheme,
  PieLegend,
  PieSeries,
  type PieSliceData,
  PieTooltip,
  Title,
} from '@wick-charts/react';

import { Cell } from '../components/Cell';
import { ICONS } from '../components/playground/icons';
import { Playground, type PlaygroundChartProps } from '../components/playground/Playground';
import { Toggle } from '../components/playground/primitives';
import type { RowSpec, SectionSpec } from '../components/playground/sections';

interface PieSettings {
  donut: boolean;
  tooltipVisible: boolean;
  legendVisible: boolean;
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
  gradient,
  data,
  donut,
  tooltipVisible,
  legendVisible,
  title,
}: PlaygroundChartProps & PieSettings & { data: PieSliceData[]; title: string }) {
  const sid = 'pie';

  return (
    <ChartContainer
      theme={theme}
      axis={{ y: { visible: false, widthPx: 0 }, x: { visible: false, heightPx: 0 } }}
      gradient={gradient}
    >
      <Title sub={donut ? 'donut' : 'pie'}>{title}</Title>
      <PieSeries
        id={sid}
        data={data}
        options={{
          innerRadiusRatio: donut ? 0.55 : 0,
          padAngle: 0.03,
          stroke: { color: theme.background, widthPx: 2 },
        }}
      />
      {tooltipVisible && <PieTooltip seriesId={sid} />}
      {legendVisible && <PieLegend seriesId={sid} />}
    </ChartContainer>
  );
}

const DISPLAY_EXTRA: SectionSpec = {
  id: 'display-pie',
  title: 'Display',
  extend: 'display',
  icon: ICONS.display,
  rows: [
    {
      key: 'donut',
      label: 'Donut',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'tooltipVisible',
      label: 'Tooltip',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'legendVisible',
      label: 'Legend',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
  ] as RowSpec[],
};

export function PiePage({ theme }: { theme: ChartTheme }) {
  return (
    <Playground<PieSettings>
      id="pie"
      theme={theme}
      extraDefaults={{ donut: false, tooltipVisible: true, legendVisible: true }}
      gridTemplate="1fr 1fr"
      gridColumns="1fr 1fr"
      hideCartesian
      sections={[DISPLAY_EXTRA]}
      charts={(props) => (
        <>
          <Cell theme={props.theme}>
            <PieChart {...props} data={PORTFOLIO} title="Portfolio" />
          </Cell>
          <Cell theme={props.theme}>
            <PieChart {...props} data={REVENUE} title="Revenue" />
          </Cell>
          <Cell theme={props.theme}>
            <PieChart {...props} data={CHAINS} title="Chains" />
          </Cell>
          <Cell theme={props.theme}>
            <PieChart {...props} data={ALLOCATION} title="Allocation" />
          </Cell>
        </>
      )}
      codeConfig={(s) => ({
        theme: 'darkTheme',
        components: [
          {
            component: 'PieSeries',
            props: { id: 'sid', data: 'data', options: { innerRadiusRatio: s.donut ? 0.55 : 0, padAngle: 0.03 } },
          },
          ...(s.tooltipVisible ? [{ component: 'PieTooltip', props: { seriesId: 'sid' } }] : []),
          ...(s.legendVisible ? [{ component: 'PieLegend', props: { seriesId: 'sid' } }] : []),
        ],
      })}
    />
  );
}
