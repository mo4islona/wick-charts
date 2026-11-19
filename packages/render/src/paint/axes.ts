import type { SKRSContext2D } from '@napi-rs/canvas';
import {
  type ChartInstance,
  type YAxisPosition,
  isNewYearsDay,
  resolveAxisFontSize,
  resolveAxisTextColor,
} from '@wick-charts/core';

import { type TextStyle, drawText, measureText } from './text';

// The constants below are the ones `mountAxisLabels` lays the DOM labels out with.

/** CSS px from a Y label to the column's outer edge. */
const Y_LABEL_INSET_PX = 8;

/** How far past the chart edge a tick label takes to fade out, CSS px. */
const EDGE_FADE_PX = 8;

/** CSS px kept clear between two category names. */
const CATEGORY_GAP_PX = 8;

const DAY = 86_400_000;
const YEAR = 365 * DAY;

/** Draw the tick labels `<XAxis>` and `<YAxis>` show, in container CSS px. */
export function paintAxisLabels(params: { ctx: SKRSContext2D; chart: ChartInstance; x: boolean; y: boolean }): void {
  const { ctx, chart } = params;

  if (params.y) {
    for (const side of ['left', 'right'] as const) {
      paintYLabels({ ctx, chart, side });
    }
  }

  if (params.x && chart.xAxisHeight > 0) paintXLabels(ctx, chart);
}

function axisStyle(chart: ChartInstance, axis: 'x' | 'y'): TextStyle {
  const theme = chart.getTheme();

  return {
    size: resolveAxisFontSize(theme, axis),
    family: theme.typography.fontFamily,
    color: resolveAxisTextColor(theme, axis),
  };
}

/** The scale whose column sits on `side`: `undefined` for the default scale, `null` for no column. */
function columnScale(chart: ChartInstance, side: YAxisPosition): string | undefined | null {
  if (chart.getAxisColumnWidth(side) <= 0) return null;

  const named = chart.getAxisColumnScale(side);
  if (named !== null) return named;

  return side === chart.yAxisPosition ? undefined : null;
}

function paintYLabels(params: { ctx: SKRSContext2D; chart: ChartInstance; side: YAxisPosition }): void {
  const { ctx, chart, side } = params;
  const scale = columnScale(chart, side);
  if (scale === null) return;

  const yScale = chart.getYScale(scale);
  const style = axisStyle(chart, 'y');
  const plotHeight = yScale.getMediaHeight();
  const width = chart.getMediaSize().width;
  const x = side === 'left' ? Y_LABEL_INSET_PX : width - Y_LABEL_INSET_PX;

  for (const value of yScale.niceTickValues()) {
    const text = yScale.formatTick(value);
    const box = measureText({ ctx, text, style });
    const half = (box.ascent + box.descent) / 2;

    const y = yScale.valueToSnappedY(value);
    const overshoot = Math.max(-y, y - plotHeight, 0);
    if (overshoot >= EDGE_FADE_PX) continue;

    // A label at the plot's top edge shifts down to fit; one on the floor may run into the X row.
    const max = plotHeight + chart.xAxisHeight - half;
    const center = half > max ? y : Math.min(Math.max(y, half), max);
    const opacity = (1 - overshoot / EDGE_FADE_PX) * headerClearance({ chart, side, top: center - half, style });

    const baseline = center - half + box.ascent;
    drawText({ ctx, text, style, x, y: baseline, align: side === 'left' ? 'left' : 'right', opacity });
  }
}

/** A left axis shares its column with the header: a label fades out across its own height as it rises under it. */
function headerClearance(params: { chart: ChartInstance; side: YAxisPosition; top: number; style: TextStyle }): number {
  const { chart, side, top, style } = params;
  const header = chart.headerHeight;
  if (header <= 0 || side !== 'left') return 1;

  const labelHeight = style.size;

  return Math.min(Math.max((top - header + labelHeight) / labelHeight, 0), 1);
}

function paintXLabels(ctx: SKRSContext2D, chart: ChartInstance): void {
  const timeScale = chart.timeScale;
  const style = axisStyle(chart, 'x');
  const { ticks, tickInterval } = timeScale.niceTickValues(chart.getDataInterval());
  const isCategory = timeScale.getType() === 'category';
  const bandCount = timeScale.getCategories().length;
  const stride = isCategory ? categoryStride({ ctx, chart, style }) : 1;

  const mediaWidth = timeScale.getMediaWidth();
  const leftColumn = chart.getAxisColumnWidth('left');
  const rightColumn = chart.getAxisColumnWidth('right');
  const rowCenter = chart.getMediaSize().height - chart.xAxisHeight / 2;

  for (const value of ticks) {
    const orphan = isCategory && value >= bandCount;
    const skipped = isCategory && value % stride !== 0;
    if (orphan || skipped) continue;

    const x = timeScale.timeToSnappedX(value);
    const overshoot = Math.max(-x, x - mediaWidth, 0);
    if (overshoot >= EDGE_FADE_PX) continue;

    const text = formatXLabel({ chart, value, tickInterval });
    const maxWidth = isCategory ? categoryRoom({ chart, x, stride }) : undefined;
    const box = measureText({ ctx, text, style });
    const half = Math.min(box.width, maxWidth ?? Number.POSITIVE_INFINITY) / 2;

    // A label near the edge shifts inward to fit and may run under a Y-axis column.
    const min = half - leftColumn;
    const max = mediaWidth + rightColumn - half;
    const center = min > max ? x : Math.min(Math.max(x, min), max);
    const baseline = rowCenter - (box.ascent + box.descent) / 2 + box.ascent;
    const opacity = 1 - overshoot / EDGE_FADE_PX;

    drawText({ ctx, text, style, x: leftColumn + center, y: baseline, align: 'center', opacity, maxWidth });
  }
}

function formatXLabel(params: { chart: ChartInstance; value: number; tickInterval: number }): string {
  const { chart, value, tickInterval } = params;
  const scale = chart.timeScale;
  const builtInDates = scale.getType() === 'time' && scale.getFormat() === null && tickInterval >= DAY;
  // Date labels carry no year, so the tick on January 1 names it instead.
  const yearStart = builtInDates && tickInterval < YEAR && isNewYearsDay(value, scale.getTimeZone());

  return scale.formatX(value, yearStart ? YEAR : tickInterval);
}

/** A category axis names every n-th band when the names outgrow their bands. */
function categoryStride(params: { ctx: SKRSContext2D; chart: ChartInstance; style: TextStyle }): number {
  const { ctx, chart, style } = params;
  const step = chart.timeScale.barWidthMedia(1);
  if (!(step > 0)) return 1;

  let widest = 0;
  const names = chart.timeScale.getCategories();
  for (let i = 0; i < names.length; i++) {
    const text = chart.timeScale.formatX(i, 1);
    widest = Math.max(widest, measureText({ ctx, text, style }).width);
  }

  const room = Math.min(widest, chart.timeScale.getMinLabelSpacing()) + CATEGORY_GAP_PX;

  return Math.max(1, Math.ceil(room / step));
}

/** A name's slot, cut where the chart ends. */
function categoryRoom(params: { chart: ChartInstance; x: number; stride: number }): number {
  const { chart, x, stride } = params;
  const half = (stride * chart.timeScale.barWidthMedia(1) - CATEGORY_GAP_PX) / 2;
  const mediaWidth = chart.timeScale.getMediaWidth();
  const anchor = Math.min(Math.max(x, 0), mediaWidth);
  const cutLeft = Math.max(0, -chart.getAxisColumnWidth('left') - (anchor - half));
  const cutRight = Math.max(0, anchor + half - (mediaWidth + chart.getAxisColumnWidth('right')));

  return Math.max(0, 2 * half - cutLeft - cutRight);
}
