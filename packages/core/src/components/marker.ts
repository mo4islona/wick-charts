import type { BitmapCoordinateSpace } from '../canvas-manager';
import type { XScale } from '../scales/x-scale';
import type { YScale } from '../scales/y-scale';
import type { ChartTheme } from '../theme/types';
import type { TimeValue } from '../types';
import { hexToRgba } from '../utils/color';
import { CHIP_TAIL_HEIGHT_MEDIA, drawChip, measureChip } from './annotation-chip';

/**
 * Glyph drawn at the marker anchor. On a bare marker, arrows point their tip
 * *at* the anchor point. On a labeled marker the callout tail does the
 * pointing instead — the arrow glyph is dropped and the shape only picks the
 * callout's side: above the anchor for `arrow-down`, below for `arrow-up`.
 * `dot` and `circle` keep their glyph under the callout.
 */
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
  /**
   * Optional text label, drawn as a callout chip whose tail points at the
   * anchor — above it for `arrow-down` / `dot` / `circle`, below for
   * `arrow-up`, flipping when the plot edge would cut it off. On arrow
   * shapes the tail replaces the glyph.
   */
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
/** Clearance between a dot / circle glyph and the callout tail tip, in media pixels. */
const CALLOUT_STANDOFF_MEDIA = 3;
/** Minimum gap between a callout chip and the plot edges, in media pixels. */
const CALLOUT_INSET_MEDIA = 4;

export interface RenderMarkerArgs {
  scope: BitmapCoordinateSpace;
  timeScale: XScale;
  yScale: YScale;
  theme: ChartTheme;
  marker: ResolvedMarker;
  /** Pulse phase ∈ [0, 1). Ignored unless `marker.pulse`. */
  phase: number;
  /** Plot-area width in bitmap pixels — keeps labeled callouts inside the plot. */
  plotWidth: number;
  /** Plot-area height in bitmap pixels — flips a callout that would leave the plot. */
  plotHeight: number;
}

/** Draw a single resolved marker onto the overlay layer. */
export function renderMarker(args: RenderMarkerArgs): void {
  const { scope, timeScale, yScale, theme, marker, phase, plotWidth, plotHeight } = args;
  const { context, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope;

  const bx = timeScale.timeToBitmapX(marker.time);
  const by = yScale.valueToBitmapY(marker.value);
  if (!Number.isFinite(bx) || !Number.isFinite(by)) return;

  const radius = GLYPH_RADIUS_MEDIA * hpr;
  const isArrow = marker.shape === 'arrow-up' || marker.shape === 'arrow-down';
  const hasLabel = marker.label !== undefined && marker.label !== '';

  context.save();

  if (marker.pulse) {
    drawPulseHalo({ context, bx, by, color: marker.color, radius, hpr, phase });
  }

  // A labeled arrow marker draws no standalone glyph — the callout's own tail
  // *is* the arrow, one continuous shape whose tip sits on the anchor.
  if (!(isArrow && hasLabel)) {
    drawGlyph({ context, bx, by, color: marker.color, radius, hpr, vpr, shape: marker.shape });
  }

  if (marker.label !== undefined && marker.label !== '') {
    drawCallout({
      context,
      bx,
      by,
      color: marker.color,
      theme,
      hpr,
      vpr,
      label: marker.label,
      shape: marker.shape,
      plotWidth,
      plotHeight,
    });
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

interface CalloutArgs {
  context: CanvasRenderingContext2D;
  bx: number;
  by: number;
  color: string;
  theme: ChartTheme;
  hpr: number;
  vpr: number;
  label: string;
  shape: MarkerShape;
  plotWidth: number;
  plotHeight: number;
}

/**
 * The label as a callout: an annotation chip centered over the anchor, its
 * tail traced into the chip outline and pointing at the anchor point. Arrow
 * markers connect tail-tip-to-anchor (the tail replaces the glyph); dot and
 * circle markers keep their glyph and the tail stops just short of it. The
 * callout prefers the side the shape implies — above for `arrow-down` / dot /
 * circle, below for `arrow-up` — and flips when the plot edge cuts it off.
 */
function drawCallout(args: CalloutArgs): void {
  const { context, bx, by, color, theme, hpr, vpr, label, shape, plotWidth, plotHeight } = args;

  const { width, height } = measureChip({ context, theme, label, hpr, vpr });
  const tailHeight = CHIP_TAIL_HEIGHT_MEDIA * vpr;
  const insetX = CALLOUT_INSET_MEDIA * hpr;

  const isArrow = shape === 'arrow-up' || shape === 'arrow-down';
  const standoff = isArrow ? 0 : (GLYPH_RADIUS_MEDIA + CALLOUT_STANDOFF_MEDIA) * vpr;
  const reach = standoff + tailHeight + height;

  // Prefer the side the shape implies; flip when the plot edge would cut the chip off.
  let above = shape !== 'arrow-up';
  if (above && by - reach < 0) above = false;
  if (!above && by + reach > plotHeight) above = true;

  const tipY = above ? by - standoff : by + standoff;
  const chipY = above ? tipY - tailHeight - height : tipY + tailHeight;
  const chipX = Math.max(insetX, Math.min(bx - width / 2, plotWidth - width - insetX));

  drawChip({
    context,
    theme,
    color,
    label,
    x: chipX,
    y: chipY,
    width,
    height,
    hpr,
    vpr,
    tail: { tipX: bx, tipY },
  });
}
