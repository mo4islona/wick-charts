import type { PropValue } from '../CodePreview';
import type { PlaygroundChartProps } from './Playground';

export type CartesianSeriesKind = 'line' | 'bar' | 'candle';

const AXIS_Y_WIDTH_DEFAULT = 55;
const AXIS_X_HEIGHT_DEFAULT = 30;
const ENTRY_MS_DEFAULT = 400;
const ENTRY_ANIM_DEFAULT: Record<CartesianSeriesKind, string> = {
  line: 'grow',
  bar: 'fade-grow',
  candle: 'unfold',
};

/**
 * Build ChartContainer props shared across cartesian playground pages.
 * Emits only fields that differ from library defaults so the snippet stays minimal —
 * a user toggling nothing still sees the cleanest possible `<ChartContainer theme={...}>`.
 */
export function buildCartesianContainerProps(s: PlaygroundChartProps): Record<string, PropValue> | undefined {
  const out: Record<string, PropValue> = {};

  if (!s.grid.visible) out.grid = { visible: false };
  if (!s.gradient) out.gradient = false;
  if (s.headerLayout !== 'overlay') out.headerLayout = s.headerLayout;

  const y: Record<string, PropValue> = {};
  if (s.axis?.y?.width !== undefined && s.axis.y.width !== AXIS_Y_WIDTH_DEFAULT) {
    y.width = s.axis.y.width;
  }
  if (s.axis?.y?.min !== undefined) y.min = s.axis.y.min as PropValue;
  if (s.axis?.y?.max !== undefined) y.max = s.axis.y.max as PropValue;

  const x: Record<string, PropValue> = {};
  if (s.axis?.x?.height !== undefined && s.axis.x.height !== AXIS_X_HEIGHT_DEFAULT) {
    x.height = s.axis.x.height;
  }

  const axis: Record<string, PropValue> = {};
  if (Object.keys(y).length > 0) axis.y = y;
  if (Object.keys(x).length > 0) axis.x = x;
  if (Object.keys(axis).length > 0) out.axis = axis;

  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Build series `options` fragment for fields shared across cartesian series
 * (entry animation, entryMs, smoothMs, and `pulse` for line).
 * Callers merge this with series-specific options.
 */
export function buildCommonSeriesOptions(
  s: PlaygroundChartProps,
  kind: CartesianSeriesKind,
): Record<string, PropValue> {
  const out: Record<string, PropValue> = {};

  const anim = kind === 'line' ? s.lineEntryAnimation : kind === 'bar' ? s.barEntryAnimation : s.candleEntryAnimation;
  if (anim !== ENTRY_ANIM_DEFAULT[kind]) out.entryAnimation = anim;

  if (s.entryMs !== ENTRY_MS_DEFAULT) out.entryMs = s.entryMs;
  if (!s.liveTracking) out.smoothMs = 0;
  if (kind === 'line' && s.streaming) out.pulse = true;

  return out;
}

const NAVIGATOR_HEIGHT_DEFAULT = 60;

export type NavigatorDataType = 'line' | 'bar' | 'candlestick';

/**
 * Build the Navigator code-preview component entry when the user enabled it.
 * `pointsVar` is the variable name displayed for the `points` prop — usually
 * `'data'` for line/bar pages and `'closePoints'` for candlestick (since the
 * miniature is derived from `close` values). `dataType` controls the rendered
 * `type:` field.
 */
export function buildNavigatorComponent(
  s: PlaygroundChartProps,
  pointsVar: string,
  dataType: NavigatorDataType = 'line',
): { component: string; props: Record<string, PropValue> }[] {
  if (!s.navigatorVisible) return [];
  const props: Record<string, PropValue> = {
    data: { type: dataType, points: pointsVar } as unknown as PropValue,
  };
  if (s.navigatorHeight !== NAVIGATOR_HEIGHT_DEFAULT) props.height = s.navigatorHeight;

  return [{ component: 'Navigator', props }];
}
