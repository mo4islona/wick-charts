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

export type CandleEnterAnim = 'fade' | 'unfold' | 'slide' | 'fade-unfold' | 'none';
export type BarEnterAnim = 'fade' | 'grow' | 'fade-grow' | 'slide' | 'none';
export type LineEnterAnim = 'grow' | 'fade' | 'none';
/** @deprecated use {@link LineEnterAnim}. */
export type LineAppendAnim = LineEnterAnim;

type HeaderLayout = 'overlay' | 'inline';

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
  /** Entrance animation for candlestick series in this playground. */
  candleEnterAnimation: CandleEnterAnim;
  /** Entrance animation for bar series. */
  barEnterAnimation: BarEnterAnim;
  /** Entrance animation for line series. */
  lineEnterAnimation: LineEnterAnim;
  /** Entrance animation duration (ms) — applies to all series kinds. */
  enterMs: number;
  /** Live-tracking of the last candle/bar/line value (smooth O/H/L/C updates). */
  liveTracking: boolean;
  /** Header positioning — overlay keeps the canvas full-height; inline shifts it below the header. */
  headerLayout: HeaderLayout;
}

const COMMON_DEFAULTS: CommonState = {
  streaming: true,
  showGrid: true,
  gridStyle: 'dashed',
  showGradient: true,
  showYAxis: true,
  showXAxis: true,
  minBound: 'auto',
  maxBound: 'auto',
  yAxisWidth: 55,
  xAxisHeight: 30,
  candleEnterAnimation: 'fade-unfold',
  barEnterAnimation: 'fade-grow',
  lineEnterAnimation: 'grow',
  enterMs: 400,
  liveTracking: true,
  headerLayout: 'overlay',
};

export interface PlaygroundChartProps {
  theme: ChartTheme;
  axis: AxisConfig;
  streaming: boolean;
  gradient: boolean;
  /** Entrance animation style per series kind, threaded from the panel controls. */
  candleEnterAnimation: CandleEnterAnim;
  barEnterAnimation: BarEnterAnim;
  lineEnterAnimation: LineEnterAnim;
  /** Duration of the entrance animation in ms. */
  enterMs: number;
  /** Live-tracking smoothing of the last candle/bar/line value. */
  liveTracking: boolean;
  /** Header layout: overlay (canvas full-height) or inline (canvas shifted below header). */
  headerLayout: HeaderLayout;
}

export type AnimationKind = 'candle' | 'bar' | 'line';

export interface PlaygroundProps<T extends object> {
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
  /** Which series-kind animation selectors to expose. Default: all three. */
  animationKinds?: AnimationKind[];
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

export function Playground<T extends object>({
  id,
  theme,
  defaults,
  charts,
  settings,
  codeConfig,
  gridTemplate = '1fr 1fr',
  gridColumns = '1fr',
  hideCartesian = false,
  animationKinds = ['candle', 'bar', 'line'],
}: PlaygroundProps<T>) {
  const showCandleAnim = animationKinds.includes('candle');
  const showBarAnim = animationKinds.includes('bar');
  const showLineAnim = animationKinds.includes('line');
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
  const setCommon = (partial: Partial<CommonState>) => set(partial as Partial<T & CommonState>);

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
    candleEnterAnimation: state.candleEnterAnimation,
    barEnterAnimation: state.barEnterAnimation,
    lineEnterAnimation: state.lineEnterAnimation,
    enterMs: state.enterMs,
    liveTracking: state.liveTracking,
    headerLayout: state.headerLayout,
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
      {settings?.(state as unknown as T, setCustom)}

      {!hideCartesian && (
        <Section title="Grid" theme={theme} accent={theme.axis.textColor}>
          <Switch label="Visible" checked={state.showGrid} onChange={(v) => setCommon({ showGrid: v })} theme={theme} />
          {state.showGrid && (
            <Select
              label="Style"
              options={[
                { value: 'solid', label: 'Solid' },
                { value: 'dashed', label: 'Dashed' },
                { value: 'dotted', label: 'Dotted' },
              ]}
              value={state.gridStyle}
              onChange={(v) => setCommon({ gridStyle: v as GridStyle })}
              theme={theme}
            />
          )}
        </Section>
      )}

      <Section title="Background" theme={theme} accent={theme.axis.textColor}>
        <Switch
          label="Gradient"
          checked={state.showGradient}
          onChange={(v) => setCommon({ showGradient: v })}
          theme={theme}
        />
        {!hideCartesian && (
          <Select
            label="Header layout"
            options={[
              { value: 'overlay', label: 'Overlay (grid full-height)' },
              { value: 'inline', label: 'Inline (shift chart down)' },
            ]}
            value={state.headerLayout}
            onChange={(v) => setCommon({ headerLayout: v as HeaderLayout })}
            theme={theme}
          />
        )}
      </Section>

      {!hideCartesian && (
        <Section title="Axes" theme={theme} accent={theme.axis.textColor} defaultOpen={false}>
          <Switch
            label="Y Axis"
            checked={state.showYAxis}
            onChange={(v) => setCommon({ showYAxis: v })}
            theme={theme}
          />
          {state.showYAxis && (
            <>
              <Slider
                label="Width"
                value={state.yAxisWidth}
                onChange={(v) => setCommon({ yAxisWidth: v })}
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
                  onChange={(v) => setCommon({ minBound: v })}
                  theme={theme}
                />
                <BoundInput
                  label="Max"
                  value={state.maxBound}
                  onChange={(v) => setCommon({ maxBound: v })}
                  theme={theme}
                />
              </div>
            </>
          )}
          <div style={{ borderTop: `1px solid ${hexToRgba(theme.tooltip.borderColor, 0.2)}`, marginTop: 2 }} />
          <Switch
            label="X Axis"
            checked={state.showXAxis}
            onChange={(v) => setCommon({ showXAxis: v })}
            theme={theme}
          />
          {state.showXAxis && (
            <Slider
              label="Height"
              value={state.xAxisHeight}
              onChange={(v) => setCommon({ xAxisHeight: v })}
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
        <Section title="Data & Animations" theme={theme} accent={theme.candlestick.upColor}>
          <Switch
            label="Live"
            checked={state.streaming}
            onChange={(v) => setCommon({ streaming: v })}
            theme={theme}
            accentColor={theme.candlestick.upColor}
          />
          {showCandleAnim && (
            <Select
              label="Candles"
              options={[
                { value: 'fade', label: 'Fade' },
                { value: 'unfold', label: 'Unfold' },
                { value: 'slide', label: 'Slide' },
                { value: 'fade-unfold', label: 'Fade + Unfold' },
                { value: 'none', label: 'None' },
              ]}
              value={state.candleEnterAnimation}
              onChange={(v) => setCommon({ candleEnterAnimation: v as CandleEnterAnim })}
              theme={theme}
            />
          )}
          {showBarAnim && (
            <Select
              label="Bars"
              options={[
                { value: 'fade-grow', label: 'Fade + Grow' },
                { value: 'grow', label: 'Grow' },
                { value: 'fade', label: 'Fade' },
                { value: 'slide', label: 'Slide' },
                { value: 'none', label: 'None' },
              ]}
              value={state.barEnterAnimation}
              onChange={(v) => setCommon({ barEnterAnimation: v as BarEnterAnim })}
              theme={theme}
            />
          )}
          {showLineAnim && (
            <Select
              label="Lines"
              options={[
                { value: 'grow', label: 'Grow' },
                { value: 'fade', label: 'Fade' },
                { value: 'none', label: 'None' },
              ]}
              value={state.lineEnterAnimation}
              onChange={(v) => setCommon({ lineEnterAnimation: v as LineEnterAnim })}
              theme={theme}
            />
          )}
          <Slider
            label="Duration"
            value={state.enterMs}
            onChange={(v) => setCommon({ enterMs: v })}
            min={0}
            max={2000}
            step={50}
            theme={theme}
            suffix="ms"
          />
          <Switch
            label="Live tracking"
            checked={state.liveTracking}
            onChange={(v) => setCommon({ liveTracking: v })}
            theme={theme}
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
