import { CandlestickSeries, ChartContainer, TimeAxis, Title, Tooltip, YAxis, createTheme } from '@wick-charts/react';
import { useEffect, useMemo, useState } from 'react';

import { themes } from '../../themes';
import { generateThinCandles } from '../../data/stress';
import { generateOHLCData } from '../../data';
import type { PanelCtx, StressPanel } from './panel';

function ThinCandles({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => generateThinCandles(500, 50_000), []);
  // Override wick with a starkly different color so body vs wick is visually
  // distinguishable — the whole point of this panel is to catch a body
  // painted in the wick color. With the default theme both are the same
  // canonical hue, hiding the leak.
  const options = useMemo(
    () => ({
      up: { body: ['#aaffa0', '#008800'] as [string, string], wick: '#00355c' },
      down: { body: ['#ffa0a0', '#660000'] as [string, string], wick: '#5c1f00' },
      bodyWidthRatio: 0.6,
    }),
    [],
  );

  return (
    <ChartContainer theme={theme} perf={perfHud} interactive={false}>
      <Title sub="green/red body (≤ 2px) vs blue/brown wick — if bodies look blue/brown, the leak is back">
        Thin-candle gradient
      </Title>
      <CandlestickSeries data={data} options={options} />
      <Tooltip />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

const CYCLE_KEYS = ['GitHub Light', 'Monokai Pro', 'Handwritten'] as const;

function ThemeCycle({ perfHud }: PanelCtx) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % CYCLE_KEYS.length), 500);
    return () => clearInterval(id);
  }, []);
  const active = themes[CYCLE_KEYS[idx]];
  const data = useMemo(() => generateOHLCData(150, 42_000), []);

  return (
    <ChartContainer theme={active.theme} perf={perfHud} interactive={false}>
      <Title sub={`swap every 500ms · ${active.name}`}>Rapid theme cycle</Title>
      <CandlestickSeries data={data} />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function HighContrastCheck({ perfHud }: PanelCtx) {
  // Intentionally low-contrast palette to check which surfaces go unreadable.
  const lowContrast = useMemo(
    () =>
      createTheme({
        background: '#ffffff',
        axis: { textColor: '#e4e4e4' },
        tooltip: { background: '#ffffff', textColor: '#f0f0f0', borderColor: '#f0f0f0' },
        grid: { color: '#f6f6f6' },
      }).theme,
    [],
  );
  const data = useMemo(() => generateOHLCData(60, 100), []);

  return (
    <ChartContainer theme={lowContrast} perf={perfHud} interactive={false}>
      <Title sub="intentionally low contrast">Contrast regression</Title>
      <CandlestickSeries data={data} />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function HugeAxisFont({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => generateOHLCData(60, 42_000), []);
  const override = useMemo(
    () => ({
      ...theme,
      axis: { ...theme.axis, y: { fontSize: 36, textColor: theme.axis.textColor } },
    }),
    [theme],
  );
  return (
    <ChartContainer theme={override} perf={perfHud} interactive={false}>
      <Title sub="axis.y.fontSize: 36">Huge axis font</Title>
      <CandlestickSeries data={data} />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

export const themePanels: readonly StressPanel[] = [
  {
    id: 'theme-thin-candles',
    title: 'Thin-candle gradient',
    hint: 'Regression guard: tuple `body` with ≤2px candles must render top-stop flat, not leak wick color.',
    render: (ctx) => <ThinCandles {...ctx} />,
  },
  {
    id: 'theme-cycle',
    title: 'Rapid theme cycle',
    hint: 'Swaps theme every 500ms. No flicker, no leaked colors between presets.',
    render: (ctx) => <ThemeCycle {...ctx} />,
  },
  {
    id: 'theme-contrast',
    title: 'Low-contrast stress',
    hint: 'Near-white text on white bg — exposes surfaces that assume a dark palette.',
    render: (ctx) => <HighContrastCheck {...ctx} />,
  },
  {
    id: 'theme-big-font',
    title: 'Huge axis.y.fontSize (36)',
    hint: 'Layout must accommodate larger labels without clipping the Y axis gutter.',
    render: (ctx) => <HugeAxisFont {...ctx} />,
  },
];
