import { useMemo, useState } from 'react';

import {
  type AxisBound,
  type AxisConfig,
  type BarStacking,
  ChartContainer,
  type ChartTheme,
  Crosshair,
  type LineData,
  LineSeries,
  Tooltip,
  type TooltipSort,
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
import { generateLineData, generateWaveData } from '../data';
import { useLineStreams } from '../hooks';

type DataMode = 'wave' | 'line';
type StreamMode = 'realtime' | 'static';
type GridStyle = 'dashed' | 'solid' | 'dotted' | 'none';

function makeData(mode: DataMode, count: number, index: number): LineData[] {
  if (mode === 'wave') {
    return generateWaveData(count, {
      base: 5,
      amplitude: 100 + index * 40,
      period: 50 + index * 15,
      phase: index * 0.12,
      onset: index * 0.06,
    });
  }
  return generateLineData(count, 80 + index * 30, 60);
}

// ── Chart wrappers ─────────────────────────────────────────────

function SingleChart({
  theme,
  allData,
  streaming,
  areaFill,
  axis,
  sort,
}: {
  theme: ChartTheme;
  allData: LineData[][];
  streaming: boolean;
  areaFill: boolean;
  axis?: AxisConfig;
  sort?: TooltipSort;
}) {
  const { datasets } = useLineStreams(allData, 300);
  const data = streaming ? [datasets[0]] : [allData[0]];
  const [sid, setSid] = useState<string | null>(null);
  return (
    <ChartContainer theme={theme} axis={axis}>
      <LineSeries data={data} onSeriesId={setSid} options={{ areaFill, lineWidth: 1, pulse: streaming }} />
      {sid && <Tooltip seriesId={sid} sort={sort} />}
      <Crosshair />
      {axis?.y?.visible !== false && <YAxis />}
      {axis?.x?.visible !== false && <XAxis />}
    </ChartContainer>
  );
}

function MultiChart({
  theme,
  allData,
  streaming,
  areaFill,
  stacking,
  axis,
  sort,
  legend,
}: {
  theme: ChartTheme;
  allData: LineData[][];
  streaming: boolean;
  areaFill: boolean;
  stacking: BarStacking;
  axis?: AxisConfig;
  sort?: TooltipSort;
  legend?: boolean;
}) {
  const { datasets } = useLineStreams(allData, 500);
  const display = streaming ? datasets : allData;
  return (
    <ChartContainer theme={theme} axis={axis}>
      <LineSeries
        data={display}
        options={{
          colors: theme.seriesColors.slice(0, display.length),
          areaFill,
          lineWidth: 1,
          pulse: streaming,
          stacking,
        }}
      />
      <Tooltip sort={sort} legend={legend} />
      <Crosshair />
      {axis?.y?.visible !== false && <YAxis />}
      {axis?.x?.visible !== false && <XAxis />}
    </ChartContainer>
  );
}

// ── Code preview ─────────────────────────────────────────────

function CodePreview({
  theme,
  areaFill,
  streaming,
  stacking,
}: {
  theme: ChartTheme;
  areaFill: boolean;
  streaming: boolean;
  stacking: BarStacking;
}) {
  const opts: string[] = [];
  if (areaFill) opts.push('areaFill: true');
  if (streaming) opts.push('pulse: true');
  if (stacking !== 'off') opts.push(`stacking: '${stacking}'`);

  const optStr = opts.length > 0 ? `options={{ ${opts.join(', ')} }}` : '';

  const code = `<ChartContainer theme={theme}>
  <LineSeries
    data={layers}${optStr ? `\n    ${optStr}` : ''}
  />
  <Tooltip />
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

// ── Page ─────────────────────────────────────────────────────

const MULTI_COUNT = 6;

export function LinePage({ theme }: { theme: ChartTheme }) {
  const [dataMode, setDataMode] = useState<DataMode>('wave');
  const [streamMode, setStreamMode] = useState<StreamMode>('static');
  const [areaFill, setAreaFill] = useState(false);
  const [stacking, setStacking] = useState<BarStacking>('off');
  const [gridStyle, setGridStyle] = useState<GridStyle>('dashed');
  const [tooltipSort, setTooltipSort] = useState<TooltipSort>('none');
  const [minBound, setMinBound] = useState('auto');
  const [maxBound, setMaxBound] = useState('auto');
  const [yAxisWidth, setYAxisWidth] = useState(55);
  const [xAxisHeight, setXAxisHeight] = useState(30);
  const [showYAxis, setShowYAxis] = useState(true);
  const [showXAxis, setShowXAxis] = useState(true);
  const [showLegend, setShowLegend] = useState(true);

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

  const singleData = useMemo(() => [makeData(dataMode, 300, 0)], [dataMode]);
  const multiData = useMemo(
    () => Array.from({ length: MULTI_COUNT }, (_, i) => makeData(dataMode, 300, i)),
    [dataMode],
  );

  const streaming = streamMode === 'realtime';
  const stackingLabel = stacking === 'off' ? 'Overlapping' : stacking === 'normal' ? 'Stacked' : '100%';

  return (
    <div style={{ display: 'flex', height: '100%', gap: 6 }}>
      {/* Charts */}
      <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateRows: '1fr 1fr', gap: 6 }}>
        <Cell label="Single" sub={areaFill ? 'area' : 'line'} theme={chartTheme}>
          <SingleChart
            key={`${dataMode}-${streamMode}-s`}
            theme={chartTheme}
            allData={singleData}
            streaming={streaming}
            areaFill={areaFill}
            axis={axis}
            sort={tooltipSort}
          />
        </Cell>
        <Cell label={stackingLabel} sub={`${MULTI_COUNT} series · ${areaFill ? 'area' : 'line'}`} theme={chartTheme}>
          <MultiChart
            key={`${dataMode}-${streamMode}-${stacking}-m`}
            theme={chartTheme}
            allData={multiData}
            streaming={streaming}
            areaFill={areaFill}
            stacking={stacking}
            axis={axis}
            sort={tooltipSort}
            legend={showLegend}
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
          <Select
            label="Data"
            options={[
              { value: 'wave', label: 'Wave' },
              { value: 'line', label: 'Random' },
            ]}
            value={dataMode}
            onChange={(v) => setDataMode(v as DataMode)}
            theme={theme}
          />
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
            label="Fill"
            options={[
              { value: 'line', label: 'Line' },
              { value: 'area', label: 'Area' },
            ]}
            value={areaFill ? 'area' : 'line'}
            onChange={(v) => setAreaFill(v === 'area')}
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
          <ToggleGroup
            label="Tooltip"
            options={[
              { value: 'none', label: 'None' },
              { value: 'asc', label: 'Asc' },
              { value: 'desc', label: 'Desc' },
            ]}
            value={tooltipSort}
            onChange={(v) => setTooltipSort(v as TooltipSort)}
            theme={theme}
          />
          <Switch label="Legend" checked={showLegend} onChange={setShowLegend} theme={theme} />
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
        <CodePreview theme={theme} areaFill={areaFill} streaming={streaming} stacking={stacking} />
      </div>
    </div>
  );
}
