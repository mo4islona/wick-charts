import type { SKRSContext2D } from '@napi-rs/canvas';
import type { ChartInstance, ChartTheme } from '@wick-charts/core';

import type { LegendSpec, TitleSpec } from '../spec';
import { type TextStyle, drawText, measureText } from './text';

// Layout constants of the framework `<Title>` and `<Legend>` components, CSS px.
const TITLE_PADDING_TOP = 6;
const TITLE_PADDING_X = 8;
const TITLE_GAP = 6;
const LEGEND_SWATCH = 8;
const LEGEND_SWATCH_RADIUS = 2;
const LEGEND_SWATCH_GAP = 4;
const LEGEND_GAP_BOTTOM = 14;
const LEGEND_GAP_RIGHT = 6;
const LEGEND_PADDING_BOTTOM = { x: 8, y: 6 };
const LEGEND_PADDING_RIGHT = { x: 6, y: 8 };
/** Opacity of a hidden series' legend item. */
const LEGEND_DISABLED_OPACITY = 0.35;
/** Share of the image width a right legend can take; longer labels get an ellipsis. */
const LEGEND_RIGHT_MAX_SHARE = 0.5;

export interface LegendEntry {
  label: string;
  color: string;
  disabled: boolean;
}

function titleStyles(theme: ChartTheme): { title: TextStyle; sub: TextStyle } {
  return {
    title: {
      size: theme.typography.fontSize,
      family: theme.typography.fontFamily,
      color: theme.tooltip.textColor,
      weight: 600,
    },
    sub: { size: theme.axis.fontSize, family: theme.typography.fontFamily, color: theme.axis.textColor },
  };
}

function legendStyle(theme: ChartTheme): TextStyle {
  return { size: theme.axis.fontSize, family: theme.typography.fontFamily, color: theme.axis.textColor };
}

/** The floating header's height, CSS px: what `ChartContainer` measures and folds into the top padding. */
export function measureHeader(params: { ctx: SKRSContext2D; title: TitleSpec; theme: ChartTheme }): number {
  const { ctx, title, theme } = params;
  const styles = titleStyles(theme);
  let line = 0;

  if (title.text) {
    const box = measureText({ ctx, text: title.text, style: styles.title });
    line = Math.max(line, box.ascent + box.descent);
  }

  if (title.sub) {
    const box = measureText({ ctx, text: title.sub, style: styles.sub });
    line = Math.max(line, box.ascent + box.descent);
  }

  return line > 0 ? Math.ceil(TITLE_PADDING_TOP + line) : 0;
}

/** Title and sub on one baseline, as the `<Title>` flex row lays them out. */
export function paintTitle(params: { ctx: SKRSContext2D; title: TitleSpec; theme: ChartTheme }): void {
  const { ctx, title, theme } = params;
  const styles = titleStyles(theme);
  const parts = [
    { text: title.text, style: styles.title },
    { text: title.sub, style: styles.sub },
  ].filter((part): part is { text: string; style: TextStyle } => Boolean(part.text));

  const boxes = parts.map((part) => measureText({ ctx, text: part.text, style: part.style }));
  const ascent = Math.max(...boxes.map((box) => box.ascent));
  const baseline = TITLE_PADDING_TOP + ascent;

  let x = TITLE_PADDING_X;
  parts.forEach((part, i) => {
    drawText({ ctx, text: part.text, style: part.style, x, y: baseline });
    x += boxes[i].width + TITLE_GAP;
  });
}

/** Items as the framework `<Legend>` builds them; a pie or radial progress lists its slices. */
export function legendEntries(chart: ChartInstance): LegendEntry[] {
  const entries: LegendEntry[] = [];

  for (const seriesId of chart.getSeriesIds()) {
    const seriesVisible = chart.isSeriesVisible(seriesId);

    const slices = chart.getSliceInfo(seriesId);
    if (slices !== null) {
      for (const slice of slices) {
        entries.push({ label: slice.label, color: slice.color, disabled: !seriesVisible });
      }

      continue;
    }

    const layers = chart.getSeriesLayers(seriesId);
    if (layers !== null) {
      layers.forEach((layer, layerIndex) => {
        const visible = seriesVisible && chart.isLayerVisible(seriesId, layerIndex);
        const label = chart.getLayerLabel(seriesId, layerIndex) ?? `Series ${layerIndex + 1}`;
        entries.push({ label, color: layer.color, disabled: !visible });
      });

      continue;
    }

    const color = chart.getSeriesColor(seriesId);
    if (color === null) continue;

    entries.push({ label: chart.getSeriesLabel(seriesId) ?? 'Series', color, disabled: !seriesVisible });
  }

  return entries;
}

interface PlacedItem {
  entry: LegendEntry;
  x: number;
  /** Center of the item's line. */
  y: number;
  /** Label width before the ellipsis. */
  labelRoom: number;
}

export interface LegendLayout {
  /** CSS px the legend takes from the chart: height at the bottom, width on the right. */
  size: number;
  items: PlacedItem[];
}

function labelWidth(params: { ctx: SKRSContext2D; entry: LegendEntry; style: TextStyle; room: number }): number {
  const label = measureText({ ctx: params.ctx, text: params.entry.label, style: params.style });

  return Math.max(0, Math.min(label.width, params.room));
}

/**
 * Lay the items out in a box `width` × `height` CSS px: centered rows that
 * wrap at the bottom, a column on the right. Item positions are relative to
 * the legend's own top-left corner.
 */
export function layoutLegend(params: {
  ctx: SKRSContext2D;
  entries: LegendEntry[];
  position: NonNullable<LegendSpec['position']>;
  width: number;
  theme: ChartTheme;
}): LegendLayout {
  const { ctx, entries, position, width, theme } = params;
  const style = legendStyle(theme);
  const sample = measureText({ ctx, text: 'Hg', style });
  const lineHeight = sample.ascent + sample.descent;
  const swatch = LEGEND_SWATCH + LEGEND_SWATCH_GAP;

  if (position === 'right') {
    const room = width * LEGEND_RIGHT_MAX_SHARE - 2 * LEGEND_PADDING_RIGHT.x - swatch;
    const labels = entries.map((entry) => labelWidth({ ctx, entry, style, room }));
    const items = entries.map((entry, i) => ({
      entry,
      x: LEGEND_PADDING_RIGHT.x,
      y: LEGEND_PADDING_RIGHT.y + i * (lineHeight + LEGEND_GAP_RIGHT) + lineHeight / 2,
      labelRoom: labels[i],
    }));
    const widest = swatch + Math.max(0, ...labels);

    return { size: Math.ceil(widest + 2 * LEGEND_PADDING_RIGHT.x), items };
  }

  const rowRoom = width - 2 * LEGEND_PADDING_BOTTOM.x;
  const labels = entries.map((entry) => labelWidth({ ctx, entry, style, room: rowRoom - swatch }));
  const widths = labels.map((label) => swatch + label);
  const rows = wrapRows({ widths, room: rowRoom });
  const items: PlacedItem[] = [];
  rows.forEach((row, rowIndex) => {
    const rowWidth = row.reduce((sum, i) => sum + widths[i], 0) + (row.length - 1) * LEGEND_GAP_BOTTOM;
    let x = (width - rowWidth) / 2;
    const y = LEGEND_PADDING_BOTTOM.y + rowIndex * (lineHeight + LEGEND_GAP_BOTTOM) + lineHeight / 2;

    for (const i of row) {
      items.push({ entry: entries[i], x, y, labelRoom: labels[i] });
      x += widths[i] + LEGEND_GAP_BOTTOM;
    }
  });

  const height = 2 * LEGEND_PADDING_BOTTOM.y + rows.length * lineHeight + (rows.length - 1) * LEGEND_GAP_BOTTOM;

  return { size: Math.ceil(height), items };
}

/** Indexes of the items on each row, as `flex-wrap: wrap` breaks them. */
function wrapRows(params: { widths: number[]; room: number }): number[][] {
  const rows: number[][] = [];
  let row: number[] = [];
  let used = 0;

  params.widths.forEach((width, i) => {
    const next = row.length === 0 ? width : used + LEGEND_GAP_BOTTOM + width;
    if (row.length > 0 && next > params.room) {
      rows.push(row);
      row = [i];
      used = width;

      return;
    }

    row.push(i);
    used = next;
  });

  if (row.length > 0) rows.push(row);

  return rows;
}

export function paintLegend(params: {
  ctx: SKRSContext2D;
  layout: LegendLayout;
  origin: { x: number; y: number };
  theme: ChartTheme;
}): void {
  const { ctx, layout, origin, theme } = params;
  const style = legendStyle(theme);

  for (const { entry, x, y, labelRoom } of layout.items) {
    const left = origin.x + x;
    const center = origin.y + y;
    const opacity = entry.disabled ? LEGEND_DISABLED_OPACITY : 1;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = entry.color;
    ctx.beginPath();
    ctx.roundRect(left, center - LEGEND_SWATCH / 2, LEGEND_SWATCH, LEGEND_SWATCH, LEGEND_SWATCH_RADIUS);
    ctx.fill();
    ctx.restore();

    const box = measureText({ ctx, text: entry.label, style });
    const baseline = center - (box.ascent + box.descent) / 2 + box.ascent;
    const labelX = left + LEGEND_SWATCH + LEGEND_SWATCH_GAP;
    drawText({ ctx, text: entry.label, style, x: labelX, y: baseline, opacity, maxWidth: labelRoom + 0.5 });
  }
}

/** The container background: the theme color, or `ChartContainer` `gradient`. */
export function paintBackground(params: {
  ctx: SKRSContext2D;
  theme: ChartTheme;
  width: number;
  height: number;
  color: string | undefined;
  gradient: boolean;
}): void {
  const { ctx, theme, width, height, gradient } = params;
  const color = params.color ?? theme.background;
  if (color === 'transparent') return;

  if (gradient && params.color === undefined) {
    const [top, bottom] = theme.chartGradient;
    const fill = ctx.createLinearGradient(0, 0, 0, height);
    fill.addColorStop(0, top);
    fill.addColorStop(0.7, theme.background);
    fill.addColorStop(1, bottom);
    ctx.fillStyle = fill;
  } else {
    ctx.fillStyle = color;
  }

  ctx.fillRect(0, 0, width, height);
}
