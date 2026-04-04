import { useEffect, useState } from 'react';

import {
  BarSeries,
  CandlestickSeries,
  ChartContainer,
  type ChartTheme,
  Crosshair,
  type LineData,
  LineSeries,
  TimeAxis,
  Tooltip,
  YAxis,
  YLabel,
} from '@wick-charts/react';

import { Cell } from '../components/Cell';
import { generateBandLine, generateBarData, generateLineData, generateOHLCData, generateWaveData } from '../data';
import { useLineStreams, useOHLCStream } from '../hooks';
import { hexToRgba } from '../utils';

// ── Data ──────────────────────────────────────────────────────

const ohlc = generateOHLCData(300, 42000, 60);
const ohlc2 = generateOHLCData(300, 3200, 60);
const areaLine: LineData[] = ohlc2.map((c) => ({ time: c.time, value: c.close }));
const upperBand = generateBandLine(ohlc2, 1.0);
const lowerBand = generateBandLine(ohlc2, -1.0);
const lines = Array.from({ length: 10 }, () => generateLineData(300, 100 + Math.random() * 200, 60));
const barData = generateBarData(100, 180);
const waveLine = generateWaveData(300, { base: 5, amplitude: 140, period: 60, phase: 0 });

// ── Chart components ──────────────────────────────────────────

function CandleChart({ theme }: { theme: ChartTheme }) {
  const { data } = useOHLCStream(ohlc, 300);
  const [sid, setSid] = useState<string | null>(null);
  return (
    <ChartContainer theme={theme}>
      <CandlestickSeries data={data} onSeriesId={setSid} />
      {sid && <YLabel seriesId={sid} />}
      {sid && <Tooltip seriesId={sid} />}
      <Crosshair />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function AreaBandsChart({ theme }: { theme: ChartTheme }) {
  const { datasets } = useLineStreams([areaLine, upperBand, lowerBand], 400);
  return (
    <ChartContainer theme={theme}>
      <LineSeries data={[datasets[0]]} options={{ areaFill: true, lineWidth: 1 }} />
      <LineSeries data={[datasets[1]]} options={{ colors: [theme.bands.upper], areaFill: true, lineWidth: 1 }} />
      <LineSeries data={[datasets[2]]} options={{ colors: [theme.bands.lower], areaFill: true, lineWidth: 1 }} />
      <Tooltip />
      <Crosshair />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function MultiLineChart({ theme }: { theme: ChartTheme }) {
  const { datasets } = useLineStreams(lines, 500);
  return (
    <ChartContainer theme={theme}>
      <LineSeries
        data={datasets}
        options={{ colors: theme.seriesColors.slice(0, datasets.length), areaFill: false, lineWidth: 1 }}
      />
      <Crosshair />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function BarChart({ theme }: { theme: ChartTheme }) {
  const { datasets } = useLineStreams([barData], 600);
  return (
    <ChartContainer theme={theme}>
      <BarSeries data={[datasets[0]]} options={{ colors: [theme.candlestick.upColor, theme.candlestick.downColor] }} />
      <Crosshair />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function WaveChart({ theme }: { theme: ChartTheme }) {
  const { datasets } = useLineStreams([waveLine], 350);
  return (
    <ChartContainer theme={theme}>
      <LineSeries data={[datasets[0]]} options={{ areaFill: true, lineWidth: 1, pulse: true }} />
      <Tooltip />
      <Crosshair />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

// ── Feature pills ─────────────────────────────────────────────

const FEATURES = ['React · Svelte · Vue', 'Realtime', 'Themeable', 'MIT'];

function FeaturePill({ text, theme }: { text: string; theme: ChartTheme }) {
  return (
    <span
      style={{
        padding: '3px 10px',
        borderRadius: 100,
        border: `1px solid ${theme.tooltip.borderColor}`,
        background: hexToRgba(theme.crosshair.labelBackground, 0.4),
        color: theme.tooltip.textColor,
        opacity: 0.7,
        fontSize: theme.typography.axisFontSize,
        fontFamily: theme.typography.fontFamily,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  );
}

// ── Hero section ──────────────────────────────────────────────

const FRAMEWORKS = [
  {
    name: 'React',
    color: '#61DAFB',
    icon: (
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none">
        <circle cx="12" cy="12" r="2.5" fill="currentColor" />
        <ellipse cx="12" cy="12" rx="10" ry="4" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <ellipse
          cx="12"
          cy="12"
          rx="10"
          ry="4"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
          transform="rotate(60 12 12)"
        />
        <ellipse
          cx="12"
          cy="12"
          rx="10"
          ry="4"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
          transform="rotate(120 12 12)"
        />
      </svg>
    ),
  },
  {
    name: 'Vue',
    color: '#42b883',
    icon: (
      <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor">
        <path d="M2 3h3.5L12 14.5 18.5 3H22L12 21 2 3z" opacity="0.6" />
        <path d="M7.5 3L12 10.5 16.5 3H14L12 6.5 10 3H7.5z" />
      </svg>
    ),
  },
  {
    name: 'Svelte',
    color: '#FF3E00',
    icon: (
      <svg viewBox="0 0 512 512" width="17" height="17">
        <path
          d="M416.9 93.1c-41.1-58.9-122.4-76.3-181.2-38.9L132.5 120c-28.2 17.7-47.6 46.5-53.5 79.3-4.9 27.3-.6 55.5 12.3 80-8.8 13.4-14.9 28.5-17.7 44.2-5.9 33.4 1.8 67.8 21.6 95.4 41.2 58.9 122.4 76.3 181.2 38.9L379.6 392c28.2-17.7 47.6-46.5 53.5-79.3 4.9-27.3.6-55.5-12.3-80 8.8-13.4 14.9-28.4 17.7-44.2 5.8-33.4-1.9-67.8-21.6-95.4"
          fill="#ff3e00"
        />
        <path
          d="M225.6 424.5c-33.3 8.6-68.4-4.4-88-32.6-11.9-16.6-16.5-37.3-13-57.4.6-3.3 1.4-6.5 2.5-9.6l1.9-5.9 5.3 3.9c12.2 9 25.9 15.8 40.4 20.2l3.8 1.2-.4 3.8c-.5 5.4 1 10.9 4.2 15.3 5.9 8.5 16.5 12.4 26.5 9.8 2.2-.6 4.4-1.5 6.3-2.8l103.2-65.8c5.1-3.2 8.6-8.4 9.7-14.4 1.1-6.1-.3-12.3-3.9-17.3-5.9-8.5-16.5-12.4-26.5-9.8-2.2.6-4.4 1.5-6.3 2.8L252 291c-6.5 4.1-13.5 7.2-21 9.2-33.3 8.6-68.4-4.4-88-32.6-11.9-16.6-16.5-37.3-13-57.4 3.5-19.7 15.2-37 32.2-47.7l103.2-65.8c6.5-4.1 13.5-7.2 21-9.2 33.3-8.6 68.4 4.4 88 32.6 11.9 16.6 16.5 37.3 13 57.4-.6 3.3-1.4 6.5-2.5 9.6L383 193l-5.3-3.9c-12.2-9-25.9-15.8-40.4-20.2l-3.8-1.2.4-3.8c.5-5.4-1-10.9-4.2-15.3-5.9-8.5-16.5-12.4-26.5-9.8-2.2.6-4.4 1.5-6.3 2.8l-103.2 65.8c-5.1 3.2-8.6 8.4-9.7 14.4-1.1 6.1.3 12.3 3.9 17.3 5.9 8.5 16.5 12.4 26.5 9.8 2.2-.6 4.4-1.5 6.3-2.8L260 221c6.5-4.1 13.5-7.2 21-9.2 33.3-8.6 68.4 4.4 88 32.6 11.9 16.6 16.5 37.3 13 57.4-3.5 19.7-15.2 37-32.2 47.7l-103.2 65.8c-6.5 4.1-13.6 7.2-21 9.2"
          fill="#fff"
        />
      </svg>
    ),
  },
];

function FrameworkRotator() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % FRAMEWORKS.length), 2500);
    return () => clearInterval(timer);
  }, []);

  const fw = FRAMEWORKS[index];

  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 6,
        lineHeight: 1,
      }}
    >
      <span
        key={`icon-${fw.name}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          color: fw.color,
          position: 'relative',
          top: 1,
          animation: 'fadeSlideIn 0.4s ease',
        }}
      >
        {fw.icon}
      </span>
      <span
        key={fw.name}
        style={{
          display: 'inline-block',
          animation: 'fadeSlideIn 0.4s ease',
        }}
      >
        {fw.name}
      </span>
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </span>
  );
}

function Hero({ theme }: { theme: ChartTheme }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        padding: '50px 20px',
        textAlign: 'center',
      }}
    >
      {/* Logo + Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <img src="/wick-icon.svg" alt="" style={{ height: 40, position: 'relative', top: -4 }} />
        <span
          style={{
            fontSize: 26,
            fontWeight: 500,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: theme.tooltip.textColor,
            fontFamily: theme.typography.fontFamily,
            lineHeight: 1,
          }}
        >
          Wick charts
        </span>
      </div>

      {/* Tagline */}
      <div style={{ maxWidth: 600 }}>
        <h2
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 600,
            color: theme.tooltip.textColor,
            lineHeight: 1.4,
            fontFamily: theme.typography.fontFamily,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ marginRight: 8 }}>High-performance charting library for</div>
          <div style={{ flex: '0 70px' }}>
            <FrameworkRotator theme={theme} />
          </div>
        </h2>
        <p
          style={{
            margin: '6px 0 0',
            fontSize: theme.typography.fontSize,
            color: theme.tooltip.textColor,
            opacity: 0.6,
            lineHeight: 1.5,
            fontFamily: theme.typography.fontFamily,
          }}
        >
          Candlesticks, lines, areas, bars &mdash; all streaming in realtime. <br />
          GPU-friendly rendering. Tiny bundle, zero deps, fully themeable and open source.
        </p>
      </div>

      {/* Feature pills */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 6,
          maxWidth: 540,
        }}
      >
        {FEATURES.map((f) => (
          <FeaturePill key={f} text={f} theme={theme} />
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export function DashboardPage({ theme }: { theme: ChartTheme }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        gap: 6,
      }}
    >
      <Hero theme={theme} />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gridTemplateRows: '1fr 1fr',
          gap: 10,
          padding: 12,
        }}
      >
        <Cell label="BTC/USD" sub="1m Candlestick" theme={theme}>
          <CandleChart theme={theme} />
        </Cell>
        <Cell label="ETH/USD" sub="1m Area + Bands" theme={theme}>
          <AreaBandsChart theme={theme} />
        </Cell>
        <Cell label="Portfolio" sub="10 assets · 1m" theme={theme}>
          <MultiLineChart theme={theme} />
        </Cell>
        <Cell label="P&L Delta" sub="1m Bar" theme={theme}>
          <BarChart theme={theme} />
        </Cell>
      </div>
    </div>
  );
}
