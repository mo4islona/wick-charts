import { type CSSProperties, useEffect, useRef, useState } from 'react';

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
import { HighlightedCode } from '../components/controls';
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

const FEATURES = ['AI-first', 'React · Svelte · Vue', 'Realtime', 'Themeable', 'MIT'];

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
          <div style={{ marginRight: 8 }}>Timeseries charts for</div>
          <div style={{ flex: '0 70px' }}>
            <FrameworkRotator />
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
          Realtime. AI&#8209;first. Tiny, zero deps, open source, fully themeable.
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

// ── Getting Started ──────────────────────────────────────────

type Framework = 'react' | 'vue' | 'svelte';

const INSTALL_COMMANDS: Record<Framework, string> = {
  react: 'npm install @wick-charts/react',
  vue: 'npm install @wick-charts/vue',
  svelte: 'npm install @wick-charts/svelte',
};

const CODE_EXAMPLES: Record<Framework, string> = {
  react: `import { useState } from 'react';
import {
  ChartContainer, CandlestickSeries, Tooltip,
  Crosshair, YAxis, TimeAxis, YLabel, darkTheme
} from '@wick-charts/react';

function Chart({ data }) {
  const [id, setId] = useState('');
  return (
    <ChartContainer theme={darkTheme}>
      <CandlestickSeries data={data} onSeriesId={setId} />
      <Tooltip />
      <Crosshair />
      <YAxis />
      <TimeAxis />
      {id && <YLabel seriesId={id} />}
    </ChartContainer>
  );
}`,
  vue: `<script setup>
import { ref } from 'vue';
import {
  ChartContainer, CandlestickSeries, Tooltip,
  Crosshair, YAxis, TimeAxis, YLabel, darkTheme
} from '@wick-charts/vue';

const props = defineProps(['data']);
const id = ref('');
</script>

<template>
  <ChartContainer :theme="darkTheme">
    <CandlestickSeries :data="props.data" @series-id="id = $event" />
    <Tooltip />
    <Crosshair />
    <YAxis />
    <TimeAxis />
    <YLabel v-if="id" :series-id="id" />
  </ChartContainer>
</template>`,
  svelte: `<script>
  import {
    ChartContainer, CandlestickSeries, Tooltip,
    Crosshair, YAxis, TimeAxis, YLabel, darkTheme
  } from '@wick-charts/svelte';

  export let data = [];
  let id = '';
</script>

<ChartContainer theme={darkTheme}>
  <CandlestickSeries {data} onSeriesId={(v) => id = v} />
  <Tooltip />
  <Crosshair />
  <YAxis />
  <TimeAxis />
  {#if id}
    <YLabel seriesId={id} />
  {/if}
</ChartContainer>`,
};

const FW_TABS: { value: Framework; label: string; color: string }[] = [
  { value: 'react', label: 'React', color: '#61DAFB' },
  { value: 'vue', label: 'Vue', color: '#42b883' },
  { value: 'svelte', label: 'Svelte', color: '#FF3E00' },
];

function FrameworkTabs({ value, onChange, theme }: { value: Framework; onChange: (v: Framework) => void; theme: ChartTheme }) {
  const btnsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = FW_TABS.findIndex((t) => t.value === value);
  const [ind, setInd] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const btn = btnsRef.current[activeIndex];
    if (btn) setInd({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, [activeIndex]);

  const accent = FW_TABS[activeIndex].color;

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        background: hexToRgba(theme.tooltip.borderColor, 0.2),
        borderRadius: 7,
        padding: 2,
      }}
    >
      {ind.width > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 2,
            bottom: 2,
            left: ind.left,
            width: ind.width,
            background: hexToRgba(accent, 0.18),
            border: `1px solid ${hexToRgba(accent, 0.22)}`,
            borderRadius: 5,
            transition: 'left 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.15s ease',
            pointerEvents: 'none',
          }}
        />
      )}
      {FW_TABS.map((tab, i) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={(el) => { btnsRef.current[i] = el; }}
            onClick={() => onChange(tab.value)}
            style={{
              background: 'transparent',
              color: active ? theme.tooltip.textColor : hexToRgba(theme.axis.textColor, 0.6),
              border: 'none',
              padding: '5px 16px',
              borderRadius: 5,
              fontSize: 12,
              fontFamily: 'inherit',
              fontWeight: active ? 600 : 400,
              cursor: 'pointer',
              transition: 'color 0.2s',
              position: 'relative',
              zIndex: 1,
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function CopyButton({ text, theme }: { text: string; theme: ChartTheme }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      style={{
        background: 'transparent',
        border: 'none',
        color: copied ? '#4ade80' : hexToRgba(theme.axis.textColor, 0.5),
        cursor: 'pointer',
        padding: '2px 6px',
        fontSize: 11,
        fontFamily: 'inherit',
        borderRadius: 4,
        transition: 'color 0.2s',
      }}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function SectionHeading({ children, theme }: { children: React.ReactNode; theme: ChartTheme }) {
  return (
    <h3
      style={{
        margin: 0,
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: hexToRgba(theme.axis.textColor, 0.6),
        fontFamily: theme.typography.fontFamily,
      }}
    >
      {children}
    </h3>
  );
}

function GettingStarted({ theme }: { theme: ChartTheme }) {
  const [fw, setFw] = useState<Framework>('react');

  const cardStyle: CSSProperties = {
    background: hexToRgba(theme.crosshair.labelBackground, 0.25),
    border: `1px solid ${hexToRgba(theme.tooltip.borderColor, 0.4)}`,
    borderRadius: 10,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  };

  return (
    <div
      style={{
        padding: '40px 20px 50px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
        fontFamily: theme.typography.fontFamily,
      }}
    >
      {/* Section title */}
      <div style={{ textAlign: 'center' }}>
        <h2
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 600,
            color: theme.tooltip.textColor,
            fontFamily: theme.typography.fontFamily,
          }}
        >
          Get started
        </h2>
        <p
          style={{
            margin: '6px 0 0',
            fontSize: theme.typography.fontSize,
            color: theme.tooltip.textColor,
            opacity: 0.5,
            fontFamily: theme.typography.fontFamily,
          }}
        >
          Install the package, add the AI skill, and start building charts.
        </p>
      </div>

      {/* Framework selector */}
      <FrameworkTabs value={fw} onChange={setFw} theme={theme} />

      {/* Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          width: '100%',
          maxWidth: 900,
        }}
      >
        {/* Left: Install + AI skill */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Install */}
          <div style={cardStyle}>
            <SectionHeading theme={theme}>1. Install</SectionHeading>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: hexToRgba(theme.crosshair.labelBackground, 0.4),
                border: `1px solid ${hexToRgba(theme.tooltip.borderColor, 0.3)}`,
                borderRadius: 6,
                padding: '8px 10px',
                fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
                fontSize: 12,
                color: theme.tooltip.textColor,
              }}
            >
              <span>
                <span style={{ color: hexToRgba(theme.axis.textColor, 0.5) }}>$ </span>
                {INSTALL_COMMANDS[fw]}
              </span>
              <CopyButton text={INSTALL_COMMANDS[fw]} theme={theme} />
            </div>
          </div>

          {/* AI skill */}
          <div style={cardStyle}>
            <SectionHeading theme={theme}>2. AI Skill</SectionHeading>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                color: theme.tooltip.textColor,
                opacity: 0.7,
                lineHeight: 1.5,
              }}
            >
              Wick Charts ships with a built-in Claude Code skill. Your AI assistant will know every component, prop, and theme out of the box.
            </p>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                background: hexToRgba(theme.crosshair.labelBackground, 0.4),
                border: `1px solid ${hexToRgba(theme.tooltip.borderColor, 0.3)}`,
                borderRadius: 6,
                padding: '8px 10px',
                fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
                fontSize: 11,
                color: theme.tooltip.textColor,
              }}
            >
              <div>
                <span style={{ color: hexToRgba(theme.axis.textColor, 0.5) }}>{'// '}</span>
                <span style={{ color: hexToRgba(theme.axis.textColor, 0.7) }}>Skill auto-loaded from</span>
              </div>
              <span style={{ color: '#86efac' }}>.claude/skills/wick-charts/</span>
            </div>
          </div>
        </div>

        {/* Right: Code example */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <SectionHeading theme={theme}>3. Build a chart</SectionHeading>
            <CopyButton text={CODE_EXAMPLES[fw]} theme={theme} />
          </div>
          <HighlightedCode code={CODE_EXAMPLES[fw]} theme={theme} />
        </div>
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
        minHeight: '100%',
        gap: 6,
      }}
    >
      <Hero theme={theme} />

      <div
        style={{
          minHeight: 500,
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

      <GettingStarted theme={theme} />
    </div>
  );
}
