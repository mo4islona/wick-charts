import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  CandlestickSeries,
  ChartContainer,
  type ChartTheme,
  Crosshair,
  LineSeries,
  TimeAxis,
  Tooltip,
  YAxis,
} from '@wick-charts/react';

import { Cell } from '../components/Cell';
import { generateOHLCData, generateWaveData } from '../data';
import { hexToRgba } from '../utils';

// ── Data ──────────────────────────────────────────────────────

const ohlcData = generateOHLCData(200, 42000, 60);
const lineData1 = generateWaveData(200, { base: 5, amplitude: 120, period: 50, phase: 0, onset: 0 });
const lineData2 = generateWaveData(200, { base: 5, amplitude: 80, period: 65, phase: 0.5, onset: 0.1 });
const lineData3 = generateWaveData(200, { base: 5, amplitude: 60, period: 40, phase: 1.0, onset: 0.2 });

// ── Color picker row ──────────────────────────────────────────

function ColorRow({
  label,
  value,
  onChange,
  theme,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  theme: ChartTheme;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
        }}
      >
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: 22,
            height: 22,
            padding: 0,
            border: `1px solid ${theme.tooltip.borderColor}`,
            borderRadius: 4,
            background: 'transparent',
            cursor: 'pointer',
          }}
        />
        <span
          style={{
            fontSize: theme.typography.axisFontSize,
            color: theme.axis.textColor,
          }}
        >
          {label}
        </span>
      </label>
    </div>
  );
}

function SectionLabel({ children, theme }: { children: React.ReactNode; theme: ChartTheme }) {
  return (
    <div
      style={{
        fontSize: theme.typography.axisFontSize,
        color: theme.tooltip.textColor,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        fontWeight: 600,
        paddingTop: 4,
        paddingBottom: 2,
        borderBottom: `1px solid ${theme.tooltip.borderColor}`,
        marginBottom: 2,
      }}
    >
      {children}
    </div>
  );
}

// ── Charts ────────────────────────────────────────────────────

function CandlestickPreview({ theme }: { theme: ChartTheme }) {
  const [sid, setSid] = useState<string | null>(null);
  return (
    <ChartContainer theme={theme}>
      <CandlestickSeries data={ohlcData} onSeriesId={setSid} />
      {sid && <Tooltip seriesId={sid} />}
      <Crosshair />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

function LinePreview({ theme }: { theme: ChartTheme }) {
  const allData = [lineData1, lineData2, lineData3];
  const [sid, setSid] = useState<string | null>(null);
  return (
    <ChartContainer theme={theme}>
      <LineSeries
        data={allData}
        options={{
          colors: theme.seriesColors.slice(0, allData.length),
          areaFill: true,
          lineWidth: 1,
          pulse: true,
        }}
        onSeriesId={setSid}
      />
      {sid && <Tooltip seriesId={sid} />}
      <Crosshair />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}

// ── Page ──────────────────────────────────────────────────────

interface ThemeColors {
  background: string;
  lineColor: string;
  upColor: string;
  downColor: string;
  gridColor: string;
  textColor: string;
  series1: string;
  series2: string;
  series3: string;
}

function buildCustomTheme(base: ChartTheme, c: ThemeColors): ChartTheme {
  return {
    ...base,
    background: c.background,
    chartGradient: [lighten(c.background, 0.04), darken(c.background, 0.06)],
    grid: { ...base.grid, color: hexToRgba(c.gridColor, 0.5) },
    candlestick: {
      upColor: c.upColor,
      downColor: c.downColor,
      wickUpColor: c.upColor,
      wickDownColor: c.downColor,
    },
    line: {
      ...base.line,
      color: c.lineColor,
      areaTopColor: hexToRgba(c.lineColor, 0.08),
      areaBottomColor: hexToRgba(c.lineColor, 0.01),
    },
    seriesColors: [c.series1, c.series2, c.series3, ...base.seriesColors.slice(3)],
    crosshair: {
      ...base.crosshair,
      labelBackground: lighten(c.background, 0.12),
    },
    axis: { textColor: c.textColor },
    priceLabel: {
      ...base.priceLabel,
      upBackground: c.upColor,
      downBackground: c.downColor,
      neutralBackground: lighten(c.background, 0.12),
    },
    tooltip: {
      background: hexToRgba(c.background, 0.92),
      textColor: c.textColor,
      borderColor: hexToRgba(c.gridColor, 0.6),
    },
  };
}

function lighten(hex: string, amount: number): string {
  if (!hex.startsWith('#')) return hex;
  const r = Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) + 255 * amount));
  const g = Math.min(255, Math.round(parseInt(hex.slice(3, 5), 16) + 255 * amount));
  const b = Math.min(255, Math.round(parseInt(hex.slice(5, 7), 16) + 255 * amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function darken(hex: string, amount: number): string {
  if (!hex.startsWith('#')) return hex;
  const r = Math.max(0, Math.round(parseInt(hex.slice(1, 3), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(hex.slice(3, 5), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(hex.slice(5, 7), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function HighlightedCode({ code, theme }: { code: string; theme: ChartTheme }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (ref.current) Prism.highlightElement(ref.current);
  }, [code]);

  return (
    <pre
      style={{
        flex: 1,
        margin: 0,
        padding: 8,
        borderRadius: 4,
        background: hexToRgba(theme.crosshair.labelBackground, 0.3),
        color: theme.tooltip.textColor,
        fontSize: 10.5,
        fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
        lineHeight: 1.5,
        overflow: 'auto',
        whiteSpace: 'pre',
        tabSize: 2,
      }}
    >
      <code ref={ref} className="language-typescript">
        {code}
      </code>
    </pre>
  );
}

function generateThemeCode(c: ThemeColors): string {
  return `import { createTheme } from '@wick-charts/react'

const theme = createTheme({
  background: '${c.background}',

  candlestick: {
    upColor: '${c.upColor}',
    downColor: '${c.downColor}',
  },

  line: { color: '${c.series1}' },

  seriesColors: [
    '${c.series1}',
    '${c.series2}',
    '${c.series3}',
  ],

  bands: {
    upper: '${c.series1}',
    lower: '${c.downColor}',
  },

  grid: { color: '${c.gridColor}' },
  axis: { textColor: '${c.textColor}' },

  tooltip: {
    textColor: '${c.textColor}',
    background: '${c.background}',
    borderColor: '${c.gridColor}',
  },
})`;
}

function colorsFromTheme(theme: ChartTheme): ThemeColors {
  return {
    background: theme.background,
    lineColor: theme.line.color,
    upColor: theme.candlestick.upColor,
    downColor: theme.candlestick.downColor,
    gridColor: theme.grid.color.startsWith('rgba') ? '#3b4048' : theme.grid.color,
    textColor: theme.axis.textColor,
    series1: theme.seriesColors[0],
    series2: theme.seriesColors[1],
    series3: theme.seriesColors[2],
  };
}

export function ThemePage({ theme }: { theme: ChartTheme }) {
  const [colors, setColors] = useState<ThemeColors>(() => colorsFromTheme(theme));
  const [prevThemeBg, setPrevThemeBg] = useState(theme.background);

  // Sync colors when parent theme changes (user switched theme in header)
  if (theme.background !== prevThemeBg) {
    setPrevThemeBg(theme.background);
    setColors(colorsFromTheme(theme));
  }

  const set = (key: keyof ThemeColors) => (v: string) => setColors((prev) => ({ ...prev, [key]: v }));

  const customTheme = useMemo(() => buildCustomTheme(theme, colors), [theme, colors]);

  return (
    <div style={{ display: 'flex', height: '100%', gap: 6 }}>
      {/* Charts */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'grid',
          gridTemplateRows: '1fr 1fr',
          gap: 6,
        }}
      >
        <Cell label="Candlestick" sub="custom theme" theme={customTheme}>
          <CandlestickPreview theme={customTheme} />
        </Cell>
        <Cell label="Line" sub="3 series" theme={customTheme}>
          <LinePreview theme={customTheme} />
        </Cell>
      </div>

      {/* Color editor */}
      <div
        style={{
          width: '30vw',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '10px 12px',
            borderRadius: 6,
            border: `1px solid ${theme.tooltip.borderColor}`,
            background: theme.tooltip.background,
          }}
        >
          <SectionLabel theme={theme}>General</SectionLabel>
          <ColorRow label="Background" value={colors.background} onChange={set('background')} theme={theme} />
          <ColorRow label="Grid" value={colors.gridColor} onChange={set('gridColor')} theme={theme} />
          <ColorRow label="Text" value={colors.textColor} onChange={set('textColor')} theme={theme} />

          <SectionLabel theme={theme}>Candlestick</SectionLabel>
          <ColorRow label="Up" value={colors.upColor} onChange={set('upColor')} theme={theme} />
          <ColorRow label="Down" value={colors.downColor} onChange={set('downColor')} theme={theme} />

          <SectionLabel theme={theme}>Series</SectionLabel>
          <ColorRow label="Line / Series 1" value={colors.series1} onChange={set('series1')} theme={theme} />
          <ColorRow label="Series 2" value={colors.series2} onChange={set('series2')} theme={theme} />
          <ColorRow label="Series 3" value={colors.series3} onChange={set('series3')} theme={theme} />
        </div>

        {/* Export snippet */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            borderRadius: 6,
            border: `1px solid ${theme.tooltip.borderColor}`,
            background: theme.tooltip.background,
            padding: '8px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <span
            style={{
              fontSize: theme.typography.axisFontSize,
              color: theme.axis.textColor,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Code
          </span>
          <HighlightedCode code={generateThemeCode(colors)} theme={theme} />
        </div>
      </div>
    </div>
  );
}
