import type { ReactNode } from 'react';

// ── Types ────────────────────────────────────────────────────

export type GridStyle = 'solid' | 'dashed' | 'dotted';
export type HeaderLayout = 'overlay' | 'inline';

export type CandleEntryAnim = 'fade' | 'unfold' | 'slide' | 'fade-unfold' | 'none';
export type BarEntryAnim = 'fade' | 'grow' | 'fade-grow' | 'slide' | 'none';
export type LineEntryAnim = 'grow' | 'fade' | 'none';

export type AnimationKind = 'candle' | 'bar' | 'line';

/**
 * Flat state shared by every playground page. Nested library shapes
 * (`grid.visible`, `area.visible`, etc.) are assembled by the translation
 * layer in Playground.tsx; panel rows always index by flat key so reset and
 * active-count math stay a trivial `state[k] !== defaults[k]` comparison.
 */
export interface CommonState {
  streaming: boolean;
  // Grid
  gridVisible: boolean;
  gridStyle: GridStyle;
  // Background
  bgGradient: boolean;
  headerLayout: HeaderLayout;
  // Axes
  yAxisVisible: boolean;
  xAxisVisible: boolean;
  yAxisWidthPx: number;
  xAxisHeightPx: number;
  minBound: string;
  maxBound: string;
  // Animations
  candleEntryAnimation: CandleEntryAnim;
  barEntryAnimation: BarEntryAnim;
  lineEntryAnimation: LineEntryAnim;
  entryMs: number;
  liveTracking: boolean;
}

export const COMMON_DEFAULTS: CommonState = {
  streaming: true,
  gridVisible: true,
  gridStyle: 'dashed',
  bgGradient: true,
  headerLayout: 'overlay',
  yAxisVisible: true,
  xAxisVisible: true,
  yAxisWidthPx: 55,
  xAxisHeightPx: 30,
  minBound: 'auto',
  maxBound: 'auto',
  candleEntryAnimation: 'unfold',
  barEntryAnimation: 'fade-grow',
  lineEntryAnimation: 'grow',
  entryMs: 400,
  liveTracking: true,
};

// ── Row/Section spec types ───────────────────────────────────

export type RowSpec<V = unknown> = {
  key: string;
  label: string;
  hint?: string;
  render: (v: V, onChange: (v: V) => void) => ReactNode;
  /** Optional visibility predicate evaluated against the full flat state. */
  visible?: (state: Record<string, unknown>) => boolean;
  /** Column span inside the 2-col section grid. 1 = half-width (pairs with sibling), 2 = full row. Default 2. */
  span?: 1 | 2;
};

export type SectionSpec = {
  id: string;
  title: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  rows: RowSpec[];
  /** When set, this section's rows are appended to the built-in section with that id. */
  extend?: string;
};
