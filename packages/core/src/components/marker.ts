import type { BitmapCoordinateSpace } from '../canvas-manager';
import type { XScale } from '../scales/x-scale';
import type { YScale } from '../scales/y-scale';
import { fillRoundedRect } from '../series/painters/canvas-path';
import type { ChartTheme } from '../theme/types';
import type { TimeValue } from '../types';
import { hexToRgba } from '../utils/color';

/** Glyph drawn at the marker anchor. Arrows point their tip *at* the anchor point. */
export type MarkerShape = 'dot' | 'circle' | 'arrow-up' | 'arrow-down';

/**
 * A point annotation pinned to a `time` (X) and a `value` (Y) — "anomaly opened
 * here", "deploy happened here". Markers live outside the series model, so they
 * are excluded from tooltips, the legend, and the Y-range autoscale, and never
 * pollute series queries. Drawn on the overlay layer, clipped to the plot area.
 */
export interface MarkerConfig {
  /** X anchor — epoch ms or a `Date`. Normalized on the way in. */
  time: TimeValue;
  /**
   * Y anchor as a data value. Omit and set {@link MarkerConfig.seriesId} to snap
   * the marker to that series' nearest data point at `time`.
   */
  value?: number;
  /** Snap Y to this series' value at `time` when `value` is omitted. Also the default color source. */
  seriesId?: string;
  /** Glyph at the anchor. Default: `'dot'`. */
  shape?: MarkerShape;
  /** Reuse the line pulse halo around the anchor. Default: `false`. */
  pulse?: boolean;
  /** Optional text label drawn in a pill next to the anchor. */
  label?: string;
  /** Color override. Falls back to the series color (when `seriesId` is set), then the theme line color. */
  color?: string;
}

/** A marker with its Y value and color already resolved — what {@link renderMarker} draws. */
export interface ResolvedMarker {
  /** Normalized epoch ms. */
  time: number;
  value: number;
  color: string;
  shape: MarkerShape;
  pulse: boolean;
  label?: string;
}

/** Radius of the dot / circle glyph, in media pixels. A touch larger than the pulse dot so markers read as deliberate. */
const GLYPH_RADIUS_MEDIA = 4;
/** Half-width of the arrow glyph, in media pixels. */
const ARROW_HALF_WIDTH_MEDIA = 5;
/** Height of the arrow glyph from tip to base, in media pixels. */
const ARROW_HEIGHT_MEDIA = 9;
/** Gap between the glyph edge and the label pill, in media pixels. */
const LABEL_GAP_MEDIA = 6;
/** Horizontal / vertical padding inside the label pill, in media pixels. */
const LABEL_PAD_X_MEDIA = 6;
const LABEL_PAD_Y_MEDIA = 3;

export interface RenderMarkerArgs {
  scope: BitmapCoordinateSpace;
  timeScale: XScale;
  yScale: YScale;
  theme: ChartTheme;
  marker: ResolvedMarker;
  /** Pulse phase ∈ [0, 1). Ignored unless `marker.pulse`. */
  phase: number;
}

/** Draw a single resolved marker onto the overlay layer. */
export function renderMarker(args: RenderMarkerArgs): void {
  const { scope, timeScale, yScale, theme, marker, phase } = args;
  const { context, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope;

  const bx = timeScale.timeToBitmapX(marker.time);
  const by = yScale.valueToBitmapY(marker.value);
  if (!Number.isFinite(bx) || !Number.isFinite(by)) return;

  const radius = GLYPH_RADIUS_MEDIA * hpr;

  context.save();

  if (marker.pulse) {
    drawPulseHalo({ context, bx, by, color: marker.color, radius, hpr, phase });
  }

  drawGlyph({ context, bx, by, color: marker.color, radius, hpr, vpr, shape: marker.shape });

  if (marker.label) {
    drawLabel({ context, bx, by, color: marker.color, theme, hpr, vpr, label: marker.label, shape: marker.shape });
  }

  context.restore();
}

interface PulseHaloArgs {
  context: CanvasRenderingContext2D;
  bx: number;
  by: number;
  color: string;
  radius: number;
  hpr: number;
  phase: number;
}

/** The same breathing halo the live line pulse uses, centered on the anchor. */
function drawPulseHalo({ context, bx, by, color, radius, hpr, phase }: PulseHaloArgs): void {
  const pulse = 0.4 + 0.6 * Math.abs(Math.sin(phase * 2 * Math.PI));
  const glowRadius = radius + 4 * hpr * pulse;

  context.beginPath();
  context.arc(bx, by, glowRadius, 0, Math.PI * 2);
  context.fillStyle = hexToRgba(color, pulse * 0.3);
  context.fill();
}

interface GlyphArgs {
  context: CanvasRenderingContext2D;
  bx: number;
  by: number;
  color: string;
  radius: number;
  hpr: number;
  vpr: number;
  shape: MarkerShape;
}

function drawGlyph({ context, bx, by, color, radius, hpr, vpr, shape }: GlyphArgs): void {
  if (shape === 'dot') {
    context.beginPath();
    context.arc(bx, by, radius, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();

    return;
  }

  if (shape === 'circle') {
    context.beginPath();
    context.arc(bx, by, radius, 0, Math.PI * 2);
    context.strokeStyle = color;
    context.lineWidth = Math.max(1, Math.round(1.5 * hpr));
    context.stroke();

    return;
  }

  // Arrows: tip sits *on* the anchor point; the body extends away from it.
  const halfWidth = ARROW_HALF_WIDTH_MEDIA * hpr;
  const height = ARROW_HEIGHT_MEDIA * vpr;
  const bodyDir = shape === 'arrow-down' ? -1 : 1;

  context.beginPath();
  context.moveTo(bx, by);
  context.lineTo(bx - halfWidth, by + bodyDir * height);
  context.lineTo(bx + halfWidth, by + bodyDir * height);
  context.closePath();
  context.fillStyle = color;
  context.fill();
}

interface LabelArgs {
  context: CanvasRenderingContext2D;
  bx: number;
  by: number;
  color: string;
  theme: ChartTheme;
  hpr: number;
  vpr: number;
  label: string;
  shape: MarkerShape;
}

function drawLabel({ context, bx, by, color, theme, hpr, vpr, label, shape }: LabelArgs): void {
  const fontPx = theme.yLabel.fontSize * hpr;
  context.font = `${fontPx}px ${theme.typography.fontFamily}`;
  context.textAlign = 'left';
  context.textBaseline = 'middle';

  const padX = LABEL_PAD_X_MEDIA * hpr;
  const padY = LABEL_PAD_Y_MEDIA * vpr;
  const gap = LABEL_GAP_MEDIA * hpr;
  const glyphHalfWidth =
    shape === 'arrow-down' || shape === 'arrow-up' ? ARROW_HALF_WIDTH_MEDIA * hpr : GLYPH_RADIUS_MEDIA * hpr;

  const textWidth = context.measureText(label).width;
  const textX = bx + glyphHalfWidth + gap + padX;

  context.fillStyle = color;
  fillRoundedRect(context, {
    x: textX - padX,
    y: by - fontPx / 2 - padY,
    width: textWidth + padX * 2,
    height: fontPx + padY * 2,
    radius: 3 * hpr,
    corners: { tl: true, tr: true, br: true, bl: true },
  });

  context.fillStyle = theme.yLabel.textColor;
  context.fillText(label, textX, by);
}
