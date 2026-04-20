import { type ReactNode, useMemo } from 'react';

import type { AxisBound, AxisConfig, ChartTheme } from '@wick-charts/react';

import { useIsMobile } from '../../hooks';
import type { ChartCodeConfig } from '../CodePreview';
import { CodeTabs } from './CodeTabs';
import { ICONS } from './icons';
import { Panel } from './Panel';
import { BoundInput, Select, Slider, Toggle } from './primitives';
import {
  type AnimationKind,
  type BarEntryAnim,
  COMMON_DEFAULTS,
  type CandleEntryAnim,
  type CommonState,
  type GridStyle,
  type HeaderLayout,
  type LineEntryAnim,
  type RowSpec,
  type SectionSpec,
} from './sections';
import { themeSurfaceVars } from './themeSurface';
import { useCodeHeight, usePanelWidth, useSettings } from './useSettings';

import './styles.css';

// ── Public chart-props contract ──────────────────────────────

/** Props threaded from Playground into the charts renderer. Library shapes
 * are assembled here — pages should pass these through verbatim. */
export interface PlaygroundChartProps {
  theme: ChartTheme;
  axis: AxisConfig;
  streaming: boolean;
  gradient: boolean;
  grid: { visible: boolean };
  candleEntryAnimation: CandleEntryAnim;
  barEntryAnimation: BarEntryAnim;
  lineEntryAnimation: LineEntryAnim;
  entryMs: number;
  liveTracking: boolean;
  headerLayout: HeaderLayout;
}

// Re-export types for consumer pages
export type {
  AnimationKind,
  BarEntryAnim,
  CandleEntryAnim,
  GridStyle,
  HeaderLayout,
  LineEntryAnim,
  RowSpec,
  SectionSpec,
};

export interface PlaygroundProps<TExtra extends object = Record<string, never>> {
  id: string;
  theme: ChartTheme;
  /** Flat extra state merged on top of CommonState. */
  extraDefaults?: TExtra;
  /** Sections contributed by the page. Use `extend: 'display'` to append into a built-in. */
  sections?: SectionSpec[];
  charts: (props: PlaygroundChartProps & TExtra) => ReactNode;
  codeConfig?: (state: PlaygroundChartProps & TExtra) => ChartCodeConfig;
  gridTemplate?: string;
  gridColumns?: string;
  hideCartesian?: boolean;
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

/** Flat playground state → nested library props. */
function stateToChartProps<TExtra extends object>(
  state: CommonState & TExtra,
  theme: ChartTheme,
): PlaygroundChartProps & TExtra {
  const chartTheme: ChartTheme = state.gridVisible
    ? { ...theme, grid: { color: theme.grid.color, style: state.gridStyle } }
    : { ...theme, grid: { ...theme.grid, color: 'transparent' } };

  const axis: AxisConfig = {
    y: {
      widthPx: state.yAxisWidthPx,
      min: parseBound(state.minBound),
      max: parseBound(state.maxBound),
      visible: state.yAxisVisible,
    },
    x: { heightPx: state.xAxisHeightPx, visible: state.xAxisVisible },
  };

  return {
    ...(state as TExtra),
    theme: chartTheme,
    axis,
    streaming: state.streaming,
    gradient: state.bgGradient,
    grid: { visible: state.gridVisible },
    candleEntryAnimation: state.candleEntryAnimation,
    barEntryAnimation: state.barEntryAnimation,
    lineEntryAnimation: state.lineEntryAnimation,
    entryMs: state.entryMs,
    liveTracking: state.liveTracking,
    headerLayout: state.headerLayout,
  } as PlaygroundChartProps & TExtra;
}

// ── Built-in sections ────────────────────────────────────────

function buildBuiltinSections({
  hideCartesian,
  animationKinds,
}: {
  hideCartesian: boolean;
  animationKinds: AnimationKind[];
}): SectionSpec[] {
  const showCandle = animationKinds.includes('candle');
  const showBar = animationKinds.includes('bar');
  const showLine = animationKinds.includes('line');

  const sections: SectionSpec[] = [];

  sections.push({
    id: 'display',
    title: 'Display',
    icon: ICONS.display,
    rows: [],
  });

  if (!hideCartesian) {
    sections.push({
      id: 'grid',
      title: 'Grid',
      icon: ICONS.grid,
      defaultOpen: false,
      rows: [
        {
          key: 'gridVisible',
          label: 'Visible',
          render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
        } as RowSpec,
        {
          key: 'gridStyle',
          label: 'Style',
          visible: (s) => s.gridVisible === true,
          render: (v, onChange) => (
            <Select<GridStyle>
              value={v as GridStyle}
              options={[
                { value: 'solid', label: 'Solid' },
                { value: 'dashed', label: 'Dashed' },
                { value: 'dotted', label: 'Dotted' },
              ]}
              onChange={onChange as (v: GridStyle) => void}
            />
          ),
        } as RowSpec,
      ],
    });
  }

  if (!hideCartesian) {
    sections.push({
      id: 'y-axis',
      title: 'Y axis',
      icon: ICONS.axes,
      defaultOpen: false,
      rows: [
        {
          key: 'yAxisVisible',
          label: 'Visible',
          render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
        } as RowSpec,
        {
          key: 'yAxisWidthPx',
          label: 'Width',
          hint: 'Reserved pixels for labels',
          visible: (s) => s.yAxisVisible === true,
          render: (v, onChange) => (
            <Slider
              value={v as number}
              min={20}
              max={120}
              step={5}
              suffix="px"
              onChange={onChange as (v: number) => void}
            />
          ),
        } as RowSpec,
        {
          key: 'minBound',
          label: 'Min',
          span: 1,
          visible: (s) => s.yAxisVisible === true,
          render: (v, onChange) => <BoundInput value={v as string} onChange={onChange as (v: string) => void} />,
        } as RowSpec,
        {
          key: 'maxBound',
          label: 'Max',
          span: 1,
          visible: (s) => s.yAxisVisible === true,
          render: (v, onChange) => <BoundInput value={v as string} onChange={onChange as (v: string) => void} />,
        } as RowSpec,
      ],
    });

    sections.push({
      id: 'x-axis',
      title: 'X axis',
      icon: ICONS.axes,
      defaultOpen: false,
      rows: [
        {
          key: 'xAxisVisible',
          label: 'Visible',
          render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
        } as RowSpec,
        {
          key: 'xAxisHeightPx',
          label: 'Height',
          hint: 'Reserved pixels for labels',
          visible: (s) => s.xAxisVisible === true,
          render: (v, onChange) => (
            <Slider
              value={v as number}
              min={15}
              max={60}
              step={5}
              suffix="px"
              onChange={onChange as (v: number) => void}
            />
          ),
        } as RowSpec,
      ],
    });
  }

  const backgroundRows: RowSpec[] = [
    {
      key: 'bgGradient',
      label: 'Gradient',
      hint: 'Soft background gradient',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    } as RowSpec,
  ];
  if (!hideCartesian) {
    backgroundRows.push({
      key: 'headerLayout',
      label: 'Header layout',
      render: (v, onChange) => (
        <Select<HeaderLayout>
          value={v as HeaderLayout}
          options={[
            { value: 'overlay', label: 'Overlay (grid full-height)' },
            { value: 'inline', label: 'Inline (shift chart down)' },
          ]}
          onChange={onChange as (v: HeaderLayout) => void}
        />
      ),
    } as RowSpec);
  }
  sections.push({
    id: 'background',
    title: 'Background',
    icon: ICONS.background,
    defaultOpen: false,
    rows: backgroundRows,
  });

  if (!hideCartesian) {
    const animRows: RowSpec[] = [
      {
        key: 'streaming',
        label: 'Live',
        hint: 'Stream mock data',
        render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
      } as RowSpec,
    ];
    if (showCandle) {
      animRows.push({
        key: 'candleEntryAnimation',
        label: 'Candle entry',
        render: (v, onChange) => (
          <Select<CandleEntryAnim>
            value={v as CandleEntryAnim}
            options={[
              { value: 'none', label: 'None' },
              { value: 'fade', label: 'Fade' },
              { value: 'unfold', label: 'Unfold' },
              { value: 'slide', label: 'Slide' },
              { value: 'fade-unfold', label: 'Fade + Unfold' },
            ]}
            onChange={onChange as (v: CandleEntryAnim) => void}
          />
        ),
      } as RowSpec);
    }
    if (showBar) {
      animRows.push({
        key: 'barEntryAnimation',
        label: 'Bar entry',
        render: (v, onChange) => (
          <Select<BarEntryAnim>
            value={v as BarEntryAnim}
            options={[
              { value: 'none', label: 'None' },
              { value: 'fade', label: 'Fade' },
              { value: 'grow', label: 'Grow' },
              { value: 'fade-grow', label: 'Fade + Grow' },
              { value: 'slide', label: 'Slide' },
            ]}
            onChange={onChange as (v: BarEntryAnim) => void}
          />
        ),
      } as RowSpec);
    }
    if (showLine) {
      animRows.push({
        key: 'lineEntryAnimation',
        label: 'Line entry',
        render: (v, onChange) => (
          <Select<LineEntryAnim>
            value={v as LineEntryAnim}
            options={[
              { value: 'none', label: 'None' },
              { value: 'fade', label: 'Fade' },
              { value: 'grow', label: 'Grow' },
            ]}
            onChange={onChange as (v: LineEntryAnim) => void}
          />
        ),
      } as RowSpec);
    }
    animRows.push(
      {
        key: 'entryMs',
        label: 'Duration',
        render: (v, onChange) => (
          <Slider
            value={v as number}
            min={0}
            max={2000}
            step={50}
            suffix="ms"
            onChange={onChange as (v: number) => void}
          />
        ),
      } as RowSpec,
      {
        key: 'liveTracking',
        label: 'Live tracking',
        hint: 'Auto-scroll to newest',
        render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
      } as RowSpec,
    );

    sections.push({
      id: 'animations',
      title: 'Data & animations',
      icon: ICONS.animations,
      defaultOpen: false,
      rows: animRows,
    });
  }

  return sections;
}

/** Merge page-contributed sections: `extend:` appends rows to a built-in, otherwise the section is added as new. */
function mergeSections(builtin: SectionSpec[], extra: SectionSpec[] = []): SectionSpec[] {
  const out: SectionSpec[] = builtin.map((s) => ({ ...s, rows: [...s.rows] }));
  const addAfterIndex: { [id: string]: number } = {};
  out.forEach((s, i) => {
    addAfterIndex[s.id] = i;
  });

  const newSections: SectionSpec[] = [];

  for (const spec of extra) {
    if (spec.extend) {
      const target = out.find((s) => s.id === spec.extend);
      if (target) {
        target.rows.push(...spec.rows);
        continue;
      }
    }
    newSections.push({ ...spec, rows: [...spec.rows] });
  }

  // Page-contributed new sections go after the built-in Display but before Grid
  // so they show up near the top where users expect them.
  const displayIdx = out.findIndex((s) => s.id === 'display');
  if (displayIdx >= 0 && newSections.length > 0) {
    out.splice(displayIdx + 1, 0, ...newSections);
  } else {
    out.push(...newSections);
  }

  // Only the first non-empty section is open by default — the rest start
  // collapsed so the panel stays compact on first load.
  let foundFirst = false;
  for (const sec of out) {
    if (sec.rows.length === 0) continue;
    if (!foundFirst) {
      foundFirst = true;
      sec.defaultOpen = sec.defaultOpen ?? true;
      continue;
    }
    sec.defaultOpen = false;
  }

  return out.filter((s) => s.rows.length > 0);
}

// ── Component ────────────────────────────────────────────────

export function Playground<TExtra extends object = Record<string, never>>({
  id,
  theme,
  extraDefaults,
  sections: extraSections,
  charts,
  codeConfig,
  gridTemplate = '1fr 1fr',
  gridColumns = '1fr',
  hideCartesian = false,
  animationKinds = ['candle', 'bar', 'line'],
}: PlaygroundProps<TExtra>) {
  const fullDefaults = useMemo(
    () => ({ ...COMMON_DEFAULTS, ...(extraDefaults as object) }) as CommonState & TExtra,
    [extraDefaults],
  );

  const { state, setMany, reset, activeCount } = useSettings<CommonState & TExtra>({
    id,
    defaults: fullDefaults,
  });

  const allSections = useMemo(
    () => mergeSections(buildBuiltinSections({ hideCartesian, animationKinds }), extraSections),
    [hideCartesian, animationKinds, extraSections],
  );

  const chartProps = useMemo(() => stateToChartProps(state, theme), [state, theme]);
  const codeConfigValue = codeConfig?.(chartProps);

  const { pct, containerRef, onMouseDown } = usePanelWidth();
  const { pct: codePct, rightRef, onMouseDown: onCodeDragDown } = useCodeHeight();
  const mobile = useIsMobile();

  const surfaceVars = useMemo(() => themeSurfaceVars(theme), [theme]);

  if (mobile) {
    return (
      <div className="wick-playground" data-mobile="true" style={surfaceVars}>
        <div className="pg-shell">
          <div
            className="pg-main"
            style={{
              gridTemplateRows: undefined,
              gridAutoRows: 200,
              gridTemplateColumns: '1fr',
            }}
          >
            {charts(chartProps)}
          </div>
        </div>
        <div className="pg-right">
          <Panel<CommonState & TExtra>
            sections={allSections}
            state={state}
            setMany={setMany}
            reset={reset}
            activeCount={activeCount}
          />
          {codeConfigValue && <CodeTabs config={codeConfigValue} theme={theme} />}
        </div>
      </div>
    );
  }

  return (
    <div className="wick-playground" ref={containerRef} style={surfaceVars}>
      <div className="pg-shell">
        <div
          className="pg-main"
          style={{
            gridTemplateRows: gridTemplate,
            gridTemplateColumns: gridColumns,
          }}
        >
          {charts(chartProps)}
        </div>

        <button type="button" className="pg-drag" onMouseDown={onMouseDown} aria-label="Resize panel">
          <div className="pg-drag-thumb" />
        </button>

        <div
          className="pg-right"
          ref={rightRef}
          style={{
            width: `${pct}%`,
            gridTemplateRows: codeConfigValue ? `auto 1fr auto auto minmax(0, ${codePct}%)` : 'auto 1fr auto',
          }}
        >
          <Panel<CommonState & TExtra>
            sections={allSections}
            state={state}
            setMany={setMany}
            reset={reset}
            activeCount={activeCount}
          />
          {codeConfigValue && (
            <>
              <button type="button" className="pg-vdrag" onMouseDown={onCodeDragDown} aria-label="Resize code panel">
                <div className="pg-vdrag-thumb" />
              </button>
              <CodeTabs config={codeConfigValue} theme={theme} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Re-exports (convenience for pages) ───────────────────────

export { Row } from './Row';
export { Section } from './Section';
