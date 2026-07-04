import type { BitmapCoordinateSpace } from '../canvas-manager';
import type { XScale } from '../scales/x-scale';
import type { ChartTheme } from '../theme/types';
import type { TimeValue } from '../types';
import { hexToRgba } from '../utils/color';
import { drawChip, measureChip } from './annotation-chip';

/**
 * Right edge of a {@link TimeRegionConfig}. A concrete time closes the band;
 * `'now'` (or an omitted `to`) leaves it open-ended — it extends to the right
 * edge of the plot, the "still firing" case.
 */
export type TimeRegionEnd = TimeValue | 'now';

/**
 * A translucent vertical band shading the interval `[from, to]` — Grafana's
 * "annotation region", TradingView's highlighted session, an SRE anomaly
 * window. Regions live outside the series model: they never affect the Y-range
 * autoscale, tooltips, or the legend. Drawn on the main layer *behind* the
 * series so the data reads on top of the shading, clipped to the plot area.
 */
export interface TimeRegionConfig {
  /** Left edge — epoch ms or a `Date`. Normalized on the way in. */
  from: TimeValue;
  /**
   * Right edge — epoch ms or a `Date`. Omit (or pass `'now'`) for an open-ended
   * region that extends to the right edge of the plot — the "still firing" case.
   */
  to?: TimeRegionEnd;
  /** Band fill — any CSS color, typically translucent. Default: a faint tint of `color`. */
  fill?: string;
  /** Optional text label drawn in an annotation chip at the top of the band. */
  label?: string;
  /** Edge-line and label-chip accent. Default: the theme's muted axis text color. */
  color?: string;
}

/** A region with its edges and colors resolved — what {@link renderTimeRegion} draws. */
export interface ResolvedTimeRegion {
  /** Normalized epoch ms. */
  from: number;
  /** Normalized epoch ms, or `null` for an open-ended region (extends to the right edge). */
  to: number | null;
  fill: string;
  color: string;
  label?: string;
}

/** Alpha applied to the accent color for the band's delineating edge lines. */
const EDGE_ALPHA = 0.5;
/** Gap from the top of the plot and the visible left edge to the label chip, in media pixels. */
const LABEL_INSET_MEDIA = 6;

export interface RenderTimeRegionArgs {
  scope: BitmapCoordinateSpace;
  timeScale: XScale;
  theme: ChartTheme;
  region: ResolvedTimeRegion;
  /** Plot-area width in bitmap pixels — the right edge for open-ended regions. */
  plotWidth: number;
  /** Plot-area height in bitmap pixels — the band spans the full height. */
  plotHeight: number;
}

/** Draw a single resolved time region onto the main layer, behind the series. */
export function renderTimeRegion(args: RenderTimeRegionArgs): void {
  const { scope, timeScale, theme, region, plotWidth, plotHeight } = args;
  const { context, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope;

  const xFrom = timeScale.timeToBitmapX(region.from);
  const xTo = region.to === null ? plotWidth : timeScale.timeToBitmapX(region.to);
  if (!Number.isFinite(xFrom) || !Number.isFinite(xTo)) return;

  // Clamp the fill to the plot area; bail when the band is fully off-screen.
  const left = Math.max(0, Math.min(xFrom, xTo));
  const right = Math.min(plotWidth, Math.max(xFrom, xTo));
  if (right <= 0 || left >= plotWidth || right <= left) return;

  context.save();

  context.fillStyle = region.fill;
  context.fillRect(left, 0, right - left, plotHeight);

  // Faint edge lines delineate the boundaries — both edges when closed, the
  // left edge only when open-ended. globalAlpha keeps this format-agnostic
  // (hsl / named / 8-digit colors all blend correctly).
  context.globalAlpha = EDGE_ALPHA;
  context.strokeStyle = region.color;
  context.lineWidth = Math.max(1, Math.round(hpr));
  drawEdge(context, xFrom, plotWidth, plotHeight);
  if (region.to !== null) drawEdge(context, xTo, plotWidth, plotHeight);
  context.globalAlpha = 1;

  if (region.label) {
    drawRegionLabel({ context, theme, region, left, hpr, vpr });
  }

  context.restore();
}

/** Stroke one vertical edge line at bitmap-x `x`, skipping it when off-screen. */
function drawEdge(context: CanvasRenderingContext2D, x: number, plotWidth: number, plotHeight: number): void {
  if (x < 0 || x > plotWidth) return;

  context.beginPath();
  context.moveTo(x, 0);
  context.lineTo(x, plotHeight);
  context.stroke();
}

interface RegionLabelArgs {
  context: CanvasRenderingContext2D;
  theme: ChartTheme;
  region: ResolvedTimeRegion;
  /** Clamped left edge of the visible band, in bitmap pixels. */
  left: number;
  hpr: number;
  vpr: number;
}

/** An annotation chip at the top-left of the visible band carrying the region's label. */
function drawRegionLabel({ context, theme, region, left, hpr, vpr }: RegionLabelArgs): void {
  const label = region.label;
  if (label === undefined) return;

  const { width, height } = measureChip({ context, theme, label, hpr, vpr });

  drawChip({
    context,
    theme,
    color: region.color,
    label,
    x: left + LABEL_INSET_MEDIA * hpr,
    y: LABEL_INSET_MEDIA * vpr,
    width,
    height,
    hpr,
    vpr,
  });
}

/** Resolve a region's accent color and fill, applying theme-derived defaults. */
export function resolveTimeRegionColors(
  config: { color?: string; fill?: string },
  theme: ChartTheme,
): { color: string; fill: string } {
  const color = config.color ?? theme.axis.textColor;
  const fill = config.fill ?? hexToRgba(color, 0.08);

  return { color, fill };
}
