import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AxisBound, AxisConfig, ChartTheme } from '@wick-charts/react';

import { useIsMobile } from '../hooks';
import { hexToRgba } from '../utils';
import type { ChartCodeConfig } from './CodePreview';
import { CodePreview } from './CodePreview';
import { BoundInput, Section, Select, Slider, Switch } from './controls';
import { FrameworkSelect } from './FrameworkSelect';

// ── Types ────────────────────────────────────────────────────

type GridStyle = 'dashed' | 'solid' | 'dotted' | 'none';

interface CommonState {
  streaming: boolean;
  showGrid: boolean;
  gridStyle: GridStyle;
  showGradient: boolean;
  showYAxis: boolean;
  showXAxis: boolean;
  minBound: string;
  maxBound: string;
  yAxisWidth: number;
  xAxisHeight: number;
}

const COMMON_DEFAULTS: CommonState = {
  streaming: false,
  showGrid: true,
  gridStyle: 'dashed',
  showGradient: true,
  showYAxis: true,
  showXAxis: true,
  minBound: 'auto',
  maxBound: 'auto',
  yAxisWidth: 55,
  xAxisHeight: 30,
};

export interface PlaygroundChartProps {
  theme: ChartTheme;
  axis: AxisConfig;
  streaming: boolean;
  gradient: boolean;
}

export interface PlaygroundProps<T extends Record<string, any>> {
  id: string;
  theme: ChartTheme;
  defaults: T;
  charts: (props: PlaygroundChartProps & T) => React.ReactNode;
  settings?: (state: T, set: (partial: Partial<T>) => void) => React.ReactNode;
  codeConfig?: (state: T & PlaygroundChartProps) => ChartCodeConfig;
  /** CSS grid-template-rows for chart area. Default: '1fr 1fr'. */
  gridTemplate?: string;
  /** CSS grid-template-columns for chart area. Default: '1fr'. */
  gridColumns?: string;
  /** Hide axes/grid/streaming sections (useful for non-cartesian charts like pie). */
  hideCartesian?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────

function parseBound(raw: string): AxisBound | undefined {
  const s = raw.trim().toLowerCase();
  if (!s || s === 'auto') return undefined;
  if (s.endsWith('%')) return s;
  const n = Number.parseFloat(s);
  if (!Number.isNaN(n)) return n;
  return undefined;
}

function loadState<T>(id: string, defaults: T & CommonState): T & CommonState {
  try {
    const raw = localStorage.getItem(`playground:${id}`);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {}
  return defaults;
}

function saveState<T>(id: string, state: T & CommonState) {
  try {
    localStorage.setItem(`playground:${id}`, JSON.stringify(state));
  } catch {}
}

// ── Draggable panel width ────────────────────────────────────

const PANEL_KEY = 'playground:panel-width';
const DEFAULT_PANEL_PCT = 25; // %
const MIN_PANEL_PCT = 15;
const MAX_PANEL_PCT = 50;

function usePanelWidth() {
  const [pct, setPct] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(PANEL_KEY);
      if (saved) return Math.max(MIN_PANEL_PCT, Math.min(MAX_PANEL_PCT, Number(saved)));
    } catch {}
    return DEFAULT_PANEL_PCT;
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newPct = ((rect.right - ev.clientX) / rect.width) * 100;
      const clamped = Math.max(MIN_PANEL_PCT, Math.min(MAX_PANEL_PCT, newPct));
      setPct(clamped);
    };

    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      setPct((cur) => {
        try {
          localStorage.setItem(PANEL_KEY, String(Math.round(cur)));
        } catch {}
        return cur;
      });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  return { pct, containerRef, onMouseDown };
}

// ── Component ────────────────────────────────────────────────

export function Playground<T extends Record<string, any>>({
  id,
  theme,
  defaults,
  charts,
  settings,
  codeConfig,
  gridTemplate = '1fr 1fr',
  gridColumns = '1fr',
  hideCartesian = false,
}: PlaygroundProps<T>) {
  const fullDefaults = useMemo(() => ({ ...COMMON_DEFAULTS, ...defaults }), [defaults]);

  const [state, setStateRaw] = useState<T & CommonState>(() => loadState(id, fullDefaults));
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const set = (partial: Partial<T & CommonState>) => {
    setStateRaw((prev) => {
      const next = { ...prev, ...partial };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveState(id, next), 300);
      return next;
    });
  };

  const setCustom = (partial: Partial<T>) => set(partial as Partial<T & CommonState>);

  const reset = () => {
    setStateRaw(fullDefaults);
    localStorage.removeItem(`playground:${id}`);
  };

  // Computed values
  const chartTheme = useMemo<ChartTheme>(() => {
    if (!state.showGrid || state.gridStyle === 'none') {
      return { ...theme, grid: { ...theme.grid, color: 'transparent' } };
    }
    return { ...theme, grid: { color: theme.grid.color, style: state.gridStyle } };
  }, [theme, state.showGrid, state.gridStyle]);

  const axis = useMemo<AxisConfig>(
    () => ({
      y: {
        width: state.yAxisWidth,
        min: parseBound(state.minBound),
        max: parseBound(state.maxBound),
        visible: state.showYAxis,
      },
      x: { height: state.xAxisHeight, visible: state.showXAxis },
    }),
    [state.yAxisWidth, state.xAxisHeight, state.minBound, state.maxBound, state.showYAxis, state.showXAxis],
  );

  const chartProps: PlaygroundChartProps & T = {
    ...state,
    theme: chartTheme,
    axis,
    streaming: state.streaming,
    gradient: state.showGradient,
  };

  const codeConfigValue = codeConfig?.(chartProps);
  const { pct, containerRef, onMouseDown } = usePanelWidth();
  const mobile = useIsMobile();

  const settingsPanel = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        padding: '6px 10px 8px',
        borderRadius: 10,
        border: `1px solid ${hexToRgba(theme.tooltip.borderColor, 0.7)}`,
        background: theme.tooltip.background,
      }}
    >
      {settings && settings(state as unknown as T, setCustom)}

      {!hideCartesian && (
        <Section title="Grid" theme={theme} accent={theme.axis.textColor}>
          <Switch
            label="Visible"
            checked={state.showGrid}
            onChange={(v) => set({ showGrid: v } as any)}
            theme={theme}
          />
          {state.showGrid && (
            <Select
              label="Style"
              options={[
                { value: 'solid', label: 'Solid' },
                { value: 'dashed', label: 'Dashed' },
                { value: 'dotted', label: 'Dotted' },
              ]}
              value={state.gridStyle}
              onChange={(v) => set({ gridStyle: v as GridStyle } as any)}
              theme={theme}
            />
          )}
        </Section>
      )}

      <Section title="Background" theme={theme} accent={theme.axis.textColor}>
        <Switch
          label="Gradient"
          checked={state.showGradient}
          onChange={(v) => set({ showGradient: v } as any)}
          theme={theme}
        />
      </Section>

      {!hideCartesian && (
        <Section title="Axes" theme={theme} accent={theme.axis.textColor} defaultOpen={false}>
          <Switch
            label="Y Axis"
            checked={state.showYAxis}
            onChange={(v) => set({ showYAxis: v } as any)}
            theme={theme}
          />
          {state.showYAxis && (
            <>
              <Slider
                label="Width"
                value={state.yAxisWidth}
                onChange={(v) => set({ yAxisWidth: v } as any)}
                min={20}
                max={120}
                step={5}
                theme={theme}
                suffix="px"
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <BoundInput
                  label="Min"
                  value={state.minBound}
                  onChange={(v) => set({ minBound: v } as any)}
                  theme={theme}
                />
                <BoundInput
                  label="Max"
                  value={state.maxBound}
                  onChange={(v) => set({ maxBound: v } as any)}
                  theme={theme}
                />
              </div>
            </>
          )}
          <div style={{ borderTop: `1px solid ${hexToRgba(theme.tooltip.borderColor, 0.2)}`, marginTop: 2 }} />
          <Switch
            label="X Axis"
            checked={state.showXAxis}
            onChange={(v) => set({ showXAxis: v } as any)}
            theme={theme}
          />
          {state.showXAxis && (
            <Slider
              label="Height"
              value={state.xAxisHeight}
              onChange={(v) => set({ xAxisHeight: v } as any)}
              min={15}
              max={60}
              step={5}
              theme={theme}
              suffix="px"
            />
          )}
        </Section>
      )}

      {!hideCartesian && (
        <Section title="Data" theme={theme} accent={theme.seriesColors?.[4] ?? theme.line.color}>
          <Switch
            label="Live"
            checked={state.streaming}
            onChange={(v) => set({ streaming: v } as any)}
            theme={theme}
            accentColor={theme.candlestick.upColor}
          />
        </Section>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
        <button
          type="button"
          onClick={reset}
          style={{
            background: 'transparent',
            border: 'none',
            color: theme.axis.textColor,
            fontSize: 9,
            fontFamily: 'inherit',
            cursor: 'pointer',
            opacity: 0.35,
            transition: 'opacity 0.15s',
            padding: '2px 4px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '0.8';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '0.35';
          }}
        >
          Reset defaults
        </button>
      </div>
    </div>
  );

  if (mobile) {
    // On mobile everything stacks — use auto rows with a fixed min-height per cell
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: '100%' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateRows: undefined,
            gridAutoRows: 200,
            gridTemplateColumns: '1fr',
            gap: 6,
          }}
        >
          {charts(chartProps)}
        </div>
        {settingsPanel}
        {codeConfigValue && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <FrameworkSelect theme={theme} compact />
            </div>
            <CodePreview config={codeConfigValue} theme={theme} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ display: 'flex', height: '100%', gap: 0 }}>
      {/* Charts */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'grid',
          gridTemplateRows: gridTemplate,
          gridTemplateColumns: gridColumns,
          gap: 6,
        }}
      >
        {charts(chartProps)}
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={onMouseDown}
        style={{
          width: 8,
          cursor: 'col-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 3,
            height: 36,
            borderRadius: 2,
            background: hexToRgba(theme.tooltip.borderColor, 0.3),
            transition: 'background 0.2s',
          }}
        />
      </div>

      {/* Right panel */}
      <div
        style={{
          width: `${pct}%`,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          overflowY: 'auto',
        }}
      >
        {settingsPanel}
        {codeConfigValue && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <FrameworkSelect theme={theme} compact />
            </div>
            <CodePreview config={codeConfigValue} theme={theme} />
          </div>
        )}
      </div>
    </div>
  );
}
