import type { BitmapCoordinateSpace } from '../canvas-manager';
import type { XScale } from '../scales/x-scale';
import type { YScale } from '../scales/y-scale';
import { fillRoundedRect } from '../series/painters/canvas-path';
import type { ChartTheme } from '../theme/types';
import type { TimeValue } from '../types';

/** Dash pattern of a {@link ReferenceLineConfig}. */
export type ReferenceLineStyle = 'solid' | 'dashed';

/**
 * A straight reference line across the plot — a horizontal threshold / baseline
 * pinned to a `value`, or a vertical event boundary pinned to a `time`. Like
 * markers and regions, reference lines stay out of the series model: they don't
 * affect the Y-range autoscale, tooltips, or the legend. Drawn on the overlay
 * layer, *above* the series and clipped to the plot area, so the line reads on
 * top of the data the way a threshold should.
 */
export interface ReferenceLineConfig {
  /** Horizontal line at this Y data value. Mutually exclusive with {@link time}. */
  value?: number;
  /** Vertical line at this `time` (epoch ms or `Date`). Mutually exclusive with {@link value}. */
  time?: TimeValue;
  /** Line and label-pill color. Default: the theme line color. */
  color?: string;
  /** Optional text label drawn in a pill at the line's near end. */
  label?: string;
  /** Dash style. Default: `'dashed'`. */
  style?: ReferenceLineStyle;
  /** Stroke width in CSS pixels. Default: `1`. */
  width?: number;
}

/** Orientation of a resolved reference line. */
export type ReferenceLineOrientation = 'horizontal' | 'vertical';

/** A reference line with its orientation, coordinate, and color resolved — what {@link renderReferenceLine} draws. */
export interface ResolvedReferenceLine {
  /** `'horizontal'` when pinned to a value, `'vertical'` when pinned to a time. */
  orientation: ReferenceLineOrientation;
  /** Data coordinate — a Y value (horizontal) or a normalized epoch ms (vertical). */
  coord: number;
  color: string;
  style: ReferenceLineStyle;
  /** Stroke width in CSS pixels. */
  width: number;
  label?: string;
}

/** Dash on / off length in media pixels (matches the grid's dashed style). */
const DASH_MEDIA = 4;
/** Gap from the plot edge to the label pill, in media pixels. */
const LABEL_INSET_MEDIA = 6;
/** Horizontal / vertical padding inside the label pill, in media pixels. */
const LABEL_PAD_X_MEDIA = 6;
const LABEL_PAD_Y_MEDIA = 3;

export interface RenderReferenceLineArgs {
  scope: BitmapCoordinateSpace;
  timeScale: XScale;
  yScale: YScale;
  theme: ChartTheme;
  line: ResolvedReferenceLine;
  /** Plot-area width in bitmap pixels. */
  plotWidth: number;
  /** Plot-area height in bitmap pixels. */
  plotHeight: number;
}

/** Draw a single resolved reference line onto the overlay layer, above the series. */
export function renderReferenceLine(args: RenderReferenceLineArgs): void {
  const { scope, timeScale, yScale, theme, line, plotWidth, plotHeight } = args;
  const { context, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope;

  context.save();
  context.strokeStyle = line.color;

  if (line.style === 'dashed') {
    context.setLineDash([DASH_MEDIA * hpr, DASH_MEDIA * hpr]);
  }

  // A horizontal line's thickness is governed by the vertical ratio and vice
  // versa. Half-pixel center snap on odd widths keeps the hairline crisp at any
  // DPR (matching the grid).
  if (line.orientation === 'horizontal') {
    const y = yScale.valueToBitmapY(line.coord);
    if (!Number.isFinite(y) || y < 0 || y > plotHeight) {
      context.restore();

      return;
    }

    const lineWidth = Math.max(1, Math.round(line.width * vpr));
    const snapped = Math.round(y) + (lineWidth % 2 === 1 ? 0.5 : 0);
    context.lineWidth = lineWidth;
    context.beginPath();
    context.moveTo(0, snapped);
    context.lineTo(plotWidth, snapped);
    context.stroke();
  } else {
    const x = timeScale.timeToBitmapX(line.coord);
    if (!Number.isFinite(x) || x < 0 || x > plotWidth) {
      context.restore();

      return;
    }

    const lineWidth = Math.max(1, Math.round(line.width * hpr));
    const snapped = Math.round(x) + (lineWidth % 2 === 1 ? 0.5 : 0);
    context.lineWidth = lineWidth;
    context.beginPath();
    context.moveTo(snapped, 0);
    context.lineTo(snapped, plotHeight);
    context.stroke();
  }

  context.setLineDash([]);

  if (line.label !== undefined) {
    drawLineLabel({ context, theme, line, timeScale, yScale, plotWidth, hpr, vpr });
  }

  context.restore();
}

interface LineLabelArgs {
  context: CanvasRenderingContext2D;
  theme: ChartTheme;
  line: ResolvedReferenceLine;
  timeScale: XScale;
  yScale: YScale;
  plotWidth: number;
  hpr: number;
  vpr: number;
}

/**
 * A pill carrying the label, pinned to the line's near end: top-left for a
 * horizontal line (riding just inside the left edge, centered on the line),
 * top-right of the stroke for a vertical line.
 */
function drawLineLabel({ context, theme, line, timeScale, yScale, plotWidth, hpr, vpr }: LineLabelArgs): void {
  const label = line.label;
  if (label === undefined) return;

  const fontPx = theme.yLabel.fontSize * hpr;
  context.font = `${fontPx}px ${theme.typography.fontFamily}`;
  context.textAlign = 'left';
  context.textBaseline = 'middle';

  const padX = LABEL_PAD_X_MEDIA * hpr;
  const padY = LABEL_PAD_Y_MEDIA * vpr;
  const inset = LABEL_INSET_MEDIA * hpr;
  const insetV = LABEL_INSET_MEDIA * vpr;
  const textWidth = context.measureText(label).width;
  const pillWidth = textWidth + padX * 2;
  const pillHeight = fontPx + padY * 2;

  let pillX: number;
  let pillY: number;
  if (line.orientation === 'horizontal') {
    pillX = inset;
    pillY = yScale.valueToBitmapY(line.coord) - pillHeight / 2;
  } else {
    // Keep the pill inside the plot when the line sits near the right edge.
    const x = timeScale.timeToBitmapX(line.coord);
    pillX = Math.min(x + inset, plotWidth - pillWidth - inset);
    pillY = insetV;
  }

  context.fillStyle = line.color;
  fillRoundedRect(context, {
    x: pillX,
    y: pillY,
    width: pillWidth,
    height: pillHeight,
    radius: 3 * hpr,
    corners: { tl: true, tr: true, br: true, bl: true },
  });

  context.fillStyle = theme.yLabel.textColor;
  context.fillText(label, pillX + padX, pillY + pillHeight / 2);
}
