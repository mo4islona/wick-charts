import { useMemo, useState } from 'react';

import {
  type AxisBound,
  type AxisConfig,
  BarSeries,
  type BarStacking,
  ChartContainer,
  type ChartTheme,
  Crosshair,
  Legend,
  type LineData,
  Tooltip,
  XAxis,
  YAxis,
} from '@wick-charts/react';

import { Cell } from '../components/Cell';
import {
  BoundInput,
  HighlightedCode,
  NumberInput,
  SectionLabel,
  Select,
  Switch,
  ToggleGroup,
} from '../components/controls';
import { generateBarData } from '../data';
import { useLineStreams } from '../hooks';

type StreamMode = 'realtime' | 'static';
type GridStyle = 'dashed' | 'solid' | 'dotted' | 'none';
type BarWidth = 'thin' | 'normal' | 'wide';

const BAR_WIDTH_MAP: Record<BarWidth, number> = { thin: 0.3, normal: 0.6, wide: 0.85 };
const LAYER_COUNT = 4;

function genLayer(count: number, base: number, interval: number): LineData[] {
  const data: LineData[] = [];
  const now = Math.floor(Date.now() / 1000);
  const start = now - count * interval;
  for (let i = 0; i < count; i++) {
    data.push({ time: start + i * interval, value: Math.round(base + Math.random() * base * 0.8) });
  }
  return data;
}

function makeLayers(): LineData[][] {
  const bases = [60, 40, 25, 15];
  return Array.from({ length: LAYER_COUNT }, (_, i) => genLayer(80, bases[i], 240));
}

// ── Chart wrappers ─────────────────────────────────────────────

function SingleBarChart({
  theme,
  data,
  streaming,
  barWidthRatio,
  axis,
}: {
  theme: ChartTheme;
  data: LineData[];
  streaming: boolean;
  barWidthRatio: number;
  axis?: AxisConfig;
}) {
  const { datasets } = useLineStreams([data], 300);
  const display = streaming ? datasets[0] : data;
  return (
    <ChartContainer theme={theme} axis={axis}>
      <BarSeries
        data={[display]}
        options={{
          colors: [theme.candlestick.upColor, theme.candlestick.downColor],
          barWidthRatio,
          stacking: 'off',
        }}
      />
      <Tooltip />
      <Crosshair />
      {axis?.y?.visible !== false && <YAxis />}
      {axis?.x?.visible !== false && <XAxis />}
    </ChartContainer>
  );
}

function MultiBarChart({
  theme,
  layers,
  streaming,
  barWidthRatio,
  stacking,
  axis,
}: {
  theme: ChartTheme;
  layers: LineData[][];
  streaming: boolean;
  barWidthRatio: number;
  stacking: BarStacking;
  axis?: AxisConfig;
}) {
  const { datasets } = useLineStreams(layers, 500);
  const display = streaming ? datasets : layers;
  const chartAxis = useMemo<AxisConfig>(() => {
    if (stacking === 'off') return { ...axis, y: { min: 0, ...axis?.y } };
    return axis ?? {};
  }, [axis, stacking]);
  return (
    <ChartContainer theme={theme} axis={chartAxis}>
      <BarSeries
        data={display}
        options={{
          colors: theme.seriesColors.slice(0, display.length),
          barWidthRatio,
          stacking,
        }}
      />
      <Tooltip legend={false} />
      <Crosshair />
      {axis?.y?.visible !== false && <YAxis />}
      {axis?.x?.visible !== false && <XAxis />}
      <Legend />
    </ChartContainer>
  );
}

// ── Code preview ──────────────────────────────────────────────

function CodePreview({
  theme,
  stacking,
  barWidthRatio,
}: {
  theme: ChartTheme;
  stacking: BarStacking;
  barWidthRatio: number;
}) {
  const code = `<ChartContainer theme={theme}>
  <BarSeries
    data={layers}
    options={{
      colors: theme.seriesColors.slice(0, ${LAYER_COUNT}),
      barWidthRatio: ${barWidthRatio},
      stacking: '${stacking}',
    }}
  />
  <Crosshair />
  <YAxis />
  <XAxis />
</ChartContainer>`;

  return <HighlightedCode code={code} theme={theme} />;
}

// ── Helpers ───────────────────────────────────────────────────

function parseBound(raw: string): AxisBound | undefined {
  const s = raw.trim().toLowerCase();
  if (!s || s === 'auto') return undefined;
  if (s.endsWith('%')) return s;
  const n = parseFloat(s);
  if (!isNaN(n)) return n;
  return undefined;
}

// ── Page ──────────────────────────────────────────────────────

export function BarPage({ theme }: { theme: ChartTheme }) {
  const [stacking, setStacking] = useState<BarStacking>('normal');
  const [streamMode, setStreamMode] = useState<StreamMode>('static');
  const [barWidth, setBarWidth] = useState<BarWidth>('normal');
  const [gridStyle, setGridStyle] = useState<GridStyle>('dashed');
  const [minBound, setMinBound] = useState('auto');
  const [maxBound, setMaxBound] = useState('auto');
  const [yAxisWidth, setYAxisWidth] = useState(55);
  const [xAxisHeight, setXAxisHeight] = useState(30);
  const [showYAxis, setShowYAxis] = useState(true);
  const [showXAxis, setShowXAxis] = useState(true);

  const chartTheme = useMemo<ChartTheme>(() => {
    if (gridStyle === 'none') return { ...theme, grid: { ...theme.grid, color: 'transparent' } };
    if (gridStyle !== theme.grid.style) return { ...theme, grid: { ...theme.grid, style: gridStyle } };
    return theme;
  }, [theme, gridStyle]);

  const axis = useMemo<AxisConfig>(
    () => ({
      y: { width: yAxisWidth, min: parseBound(minBound), max: parseBound(maxBound), visible: showYAxis },
      x: { height: xAxisHeight, visible: showXAxis },
    }),
    [yAxisWidth, xAxisHeight, minBound, maxBound, showYAxis, showXAxis],
  );

  const barWidthRatio = BAR_WIDTH_MAP[barWidth];
  const streaming = streamMode === 'realtime';

  const singleData = useMemo(() => generateBarData(80, 240), []);
  const layers = useMemo(() => makeLayers(), []);

  const stackingLabel = stacking === 'off' ? 'Overlapping' : stacking === 'normal' ? 'Stacked' : '100%';

  return (
    <div style={{ display: 'flex', height: '100%', gap: 6 }}>
      {/* Charts */}
      <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateRows: '1fr 1fr', gap: 6 }}>
        <Cell label="Single" sub="Up/Down" theme={chartTheme}>
          <SingleBarChart
            key={`single-${streamMode}`}
            theme={chartTheme}
            data={singleData}
            streaming={streaming}
            barWidthRatio={barWidthRatio}
            axis={axis}
          />
        </Cell>
        <Cell label={stackingLabel} sub={`${LAYER_COUNT} layers`} theme={chartTheme}>
          <MultiBarChart
            key={`multi-${streamMode}-${stacking}`}
            theme={chartTheme}
            layers={layers}
            streaming={streaming}
            barWidthRatio={barWidthRatio}
            stacking={stacking}
            axis={axis}
          />
        </Cell>
      </div>

      {/* Right panel */}
      <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '8px 10px',
            borderRadius: 8,
            border: `1px solid ${theme.tooltip.borderColor}`,
            background: theme.tooltip.background,
          }}
        >
          <ToggleGroup
            label="Stacking"
            options={[
              { value: 'off', label: 'Off' },
              { value: 'normal', label: 'Normal' },
              { value: 'percent', label: '100%' },
            ]}
            value={stacking}
            onChange={(v) => setStacking(v as BarStacking)}
            theme={theme}
          />
          <Switch
            label="Live"
            checked={streaming}
            onChange={(v) => setStreamMode(v ? 'realtime' : 'static')}
            theme={theme}
            accentColor={theme.candlestick.upColor}
          />
          <ToggleGroup
            label="Width"
            options={[
              { value: 'thin', label: 'Thin' },
              { value: 'normal', label: 'Normal' },
              { value: 'wide', label: 'Wide' },
            ]}
            value={barWidth}
            onChange={(v) => setBarWidth(v as BarWidth)}
            theme={theme}
            accentColor={theme.seriesColors[1]}
          />
          <Select
            label="Grid"
            options={[
              { value: 'dashed', label: 'Dashed' },
              { value: 'solid', label: 'Solid' },
              { value: 'dotted', label: 'Dotted' },
              { value: 'none', label: 'None' },
            ]}
            value={gridStyle}
            onChange={(v) => setGridStyle(v as GridStyle)}
            theme={theme}
          />
          <SectionLabel theme={theme}>Axes</SectionLabel>
          <Switch label="Y Axis" checked={showYAxis} onChange={setShowYAxis} theme={theme} />
          <Switch label="X Axis" checked={showXAxis} onChange={setShowXAxis} theme={theme} />
          <div style={{ display: 'flex', gap: 6 }}>
            <BoundInput label="Y Min" value={minBound} onChange={setMinBound} theme={theme} />
            <BoundInput label="Y Max" value={maxBound} onChange={setMaxBound} theme={theme} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <NumberInput
              label="Y Width"
              value={yAxisWidth}
              onChange={setYAxisWidth}
              min={20}
              max={120}
              step={5}
              theme={theme}
            />
            <NumberInput
              label="X Height"
              value={xAxisHeight}
              onChange={setXAxisHeight}
              min={15}
              max={60}
              step={5}
              theme={theme}
            />
          </div>
        </div>
        <CodePreview theme={theme} stacking={stacking} barWidthRatio={barWidthRatio} />
      </div>
    </div>
  );
}
