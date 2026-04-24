import { CandlestickSeries, ChartContainer, Crosshair, TimeAxis, Title, Tooltip, YAxis } from '@wick-charts/react';
import { useEffect, useMemo, useState } from 'react';

import { generateOHLCData } from '../../data';
import type { PanelCtx, StressPanel } from './panel';

function Tiny({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => generateOHLCData(40, 42_000), []);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div style={{ width: 120, height: 120, border: `1px dashed ${theme.axis.textColor}`, padding: 2 }}>
        <ChartContainer theme={theme} perf={perfHud} interactive={false}>
          <Title>120×120</Title>
          <CandlestickSeries data={data} />
          <YAxis />
          <TimeAxis />
        </ChartContainer>
      </div>
    </div>
  );
}

function Wide({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => generateOHLCData(400, 42_000), []);
  return (
    <div style={{ width: '100%', height: '100%', overflowX: 'auto' }}>
      <div style={{ width: 2000, height: '100%' }}>
        <ChartContainer theme={theme} perf={perfHud} interactive={false}>
          <Title sub="2000×~280">Wide aspect</Title>
          <CandlestickSeries data={data} />
          <Tooltip />
          <Crosshair />
          <YAxis />
          <TimeAxis />
        </ChartContainer>
      </div>
    </div>
  );
}

function HiddenRevealed({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => generateOHLCData(120, 42_000), []);
  const [hidden, setHidden] = useState(false);
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: 6, height: '100%' }}>
      <button
        type="button"
        onClick={() => setHidden((h) => !h)}
        style={{
          justifySelf: 'start',
          padding: '4px 10px',
          fontSize: 12,
          background: theme.crosshair.labelBackground,
          color: theme.crosshair.labelTextColor,
          border: `1px solid ${theme.tooltip.borderColor}`,
          borderRadius: 4,
          cursor: 'pointer',
        }}
      >
        {hidden ? 'Reveal' : 'Hide'}
      </button>
      <div style={{ display: hidden ? 'none' : 'block', height: '100%' }}>
        <ChartContainer theme={theme} perf={perfHud} interactive={false}>
          <Title sub="toggle display:none">Hidden / revealed</Title>
          <CandlestickSeries data={data} />
          <YAxis />
          <TimeAxis />
        </ChartContainer>
      </div>
    </div>
  );
}

function ExtremeZoom({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => generateOHLCData(200, 42_000), []);
  // Visible range of ~5 candles, so the chart is deeply zoomed in.
  const [range, setRange] = useState<'wide' | 'narrow'>('wide');
  useEffect(() => {
    // Cycle every 3s so reviewers see both states without interacting.
    const id = setInterval(() => setRange((r) => (r === 'wide' ? 'narrow' : 'wide')), 3000);
    return () => clearInterval(id);
  }, []);
  // Not setting visible range programmatically here (it's chart-instance-level);
  // simpler: just slice the data so the view naturally becomes narrow/wide.
  const windowed = range === 'narrow' ? data.slice(100, 105) : data;

  return (
    <ChartContainer theme={theme} perf={perfHud} interactive={false}>
      <Title sub={range === 'narrow' ? '5 visible candles' : 'full range'}>Extreme zoom</Title>
      <CandlestickSeries data={windowed} />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

export const viewportPanels: readonly StressPanel[] = [
  {
    id: 'vp-tiny',
    title: 'Tiny container (120×120)',
    hint: 'Axes will overlap. Acceptable — just no crash or invisible render.',
    render: (ctx) => <Tiny {...ctx} />,
    minHeight: 180,
  },
  {
    id: 'vp-wide',
    title: 'Wide aspect (2000 px)',
    hint: 'Horizontal scroll container; checks tick density at huge widths.',
    render: (ctx) => <Wide {...ctx} />,
    minHeight: 220,
  },
  {
    id: 'vp-extreme-zoom',
    title: 'Extreme zoom cycle',
    hint: 'Flips every 3s between full data and a 5-candle window; axis auto-range keeps up.',
    render: (ctx) => <ExtremeZoom {...ctx} />,
  },
  {
    id: 'vp-hidden',
    title: 'Hide / reveal',
    hint: 'Toggles `display:none` on the host. Resize observer path; no stuck canvas on reveal.',
    render: (ctx) => <HiddenRevealed {...ctx} />,
  },
];
