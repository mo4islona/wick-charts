import type { ChartTheme } from '../theme/types';
import { hexToRgba, isLightColor } from '../utils/color';

/**
 * The shared visual language of annotation labels — markers, time regions, and
 * reference lines all carry their text in the same *chip*: a translucent
 * surface-colored plate with a hairline accent outline, a faint accent wash,
 * and the label set in the theme ink. The accent hue identifies, the surface
 * plate keeps the text readable over any data, and nothing shouts louder than
 * the series.
 *
 * A chip can grow a *tail* — a short triangular pointer traced as part of the
 * same outline — turning it into a callout pinned to an exact anchor point.
 */

/** Horizontal padding inside the chip, in media pixels. */
const CHIP_PAD_X_MEDIA = 7;
/** Vertical padding inside the chip, in media pixels. */
const CHIP_PAD_Y_MEDIA = 3.5;
/** Corner radius of the chip plate, in media pixels. */
const CHIP_RADIUS_MEDIA = 5;
/** Half-width of the callout tail where it meets the plate, in media pixels. */
const TAIL_HALF_WIDTH_MEDIA = 4.5;
/** How far the callout tail extends from the plate toward its anchor, in media pixels. */
export const CHIP_TAIL_HEIGHT_MEDIA = 6;

/** Alpha of the surface plate — opaque enough for text, light enough that the grid ghosts through. */
const PLATE_ALPHA = 0.92;
/** Alpha of the accent wash layered over the plate. */
const WASH_ALPHA = 0.12;
/** Alpha of the hairline accent outline. */
const OUTLINE_ALPHA = 0.6;
/**
 * Contact shadow lifting the chip off the plot — tight and faint, never a
 * smudge. Light surfaces need only a whisper of it (a wide dark blur reads
 * as dirt on white); dark surfaces need more alpha for the depth to register.
 */
const SHADOW_LIGHT = 'rgba(15, 20, 35, 0.1)';
const SHADOW_DARK = 'rgba(0, 0, 0, 0.4)';
const SHADOW_BLUR_MEDIA = 3;
const SHADOW_OFFSET_Y_MEDIA = 1;

/** Chip box size for a given label, in bitmap pixels. */
export interface ChipMetrics {
  width: number;
  height: number;
}

export interface MeasureChipArgs {
  context: CanvasRenderingContext2D;
  theme: ChartTheme;
  label: string;
  hpr: number;
  vpr: number;
}

/** Measure the chip box for `label`. Also installs the chip font on the context. */
export function measureChip(args: MeasureChipArgs): ChipMetrics {
  const { context, theme, label, hpr, vpr } = args;

  context.font = chipFont(theme, hpr);
  const textWidth = context.measureText(label).width;

  return {
    width: textWidth + CHIP_PAD_X_MEDIA * hpr * 2,
    height: theme.yLabel.fontSize * hpr + CHIP_PAD_Y_MEDIA * vpr * 2,
  };
}

/** Anchor point of a callout tail, in bitmap pixels. The tail grows from the nearest chip edge toward it. */
export interface ChipTail {
  tipX: number;
  tipY: number;
}

export interface DrawChipArgs {
  context: CanvasRenderingContext2D;
  theme: ChartTheme;
  /** Accent hue — outlines the chip and tints its wash. */
  color: string;
  label: string;
  /** Top-left corner of the chip plate, in bitmap pixels. */
  x: number;
  y: number;
  /** Plate size from {@link measureChip}. */
  width: number;
  height: number;
  hpr: number;
  vpr: number;
  /** Optional callout tail pointing at an anchor above or below the plate. */
  tail?: ChipTail;
}

/** Draw one annotation chip: surface plate, accent wash, hairline outline, ink label. */
export function drawChip(args: DrawChipArgs): void {
  const { context, theme, color, label, x, y, width, height, hpr, vpr, tail } = args;

  traceChipPath({ context, x, y, width, height, hpr, tail });

  context.save();
  context.shadowColor = isLightColor(theme.background) ? SHADOW_LIGHT : SHADOW_DARK;
  context.shadowBlur = SHADOW_BLUR_MEDIA * hpr;
  context.shadowOffsetY = SHADOW_OFFSET_Y_MEDIA * vpr;
  context.fillStyle = hexToRgba(theme.background, PLATE_ALPHA);
  context.fill();
  context.restore();

  context.fillStyle = hexToRgba(color, WASH_ALPHA);
  context.fill();

  context.strokeStyle = hexToRgba(color, OUTLINE_ALPHA);
  context.lineWidth = Math.max(1, Math.round(hpr));
  context.stroke();

  context.font = chipFont(theme, hpr);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = theme.tooltip.textColor;
  context.fillText(label, x + width / 2, y + height / 2);
}

/** The chip label font — the theme label size at medium weight, so short words hold their own over data. */
function chipFont(theme: ChartTheme, hpr: number): string {
  return `500 ${theme.yLabel.fontSize * hpr}px ${theme.typography.fontFamily}`;
}

interface TraceChipPathArgs {
  context: CanvasRenderingContext2D;
  x: number;
  y: number;
  width: number;
  height: number;
  hpr: number;
  tail?: ChipTail;
}

/**
 * Trace the chip outline — a rounded rect with the tail (when present) folded
 * into the top or bottom edge as part of the same path, so fill, wash, and
 * outline all treat plate + pointer as one continuous shape.
 */
function traceChipPath({ context, x, y, width, height, hpr, tail }: TraceChipPathArgs): void {
  const r = Math.min(CHIP_RADIUS_MEDIA * hpr, width / 2, height / 2);
  const right = x + width;
  const bottom = y + height;

  // The tail base rides the flat span of the edge; the apex stays pinned to the
  // anchor even when the plate was clamped sideways, so the pointer keeps
  // pointing at the true anchor (a slanted tail, like a speech bubble's).
  const tailHalf = TAIL_HALF_WIDTH_MEDIA * hpr;
  const baseMin = x + r + tailHalf;
  const baseMax = right - r - tailHalf;
  const tailBaseX = tail === undefined ? 0 : clampTailBase(tail.tipX, baseMin, baseMax);

  const tailOnTop = tail !== undefined && tail.tipY < y;
  const tailOnBottom = tail !== undefined && tail.tipY > bottom;

  context.beginPath();
  context.moveTo(x + r, y);

  if (tail !== undefined && tailOnTop) {
    context.lineTo(tailBaseX - tailHalf, y);
    context.lineTo(tail.tipX, tail.tipY);
    context.lineTo(tailBaseX + tailHalf, y);
  }

  context.lineTo(right - r, y);
  context.arcTo(right, y, right, y + r, r);
  context.lineTo(right, bottom - r);
  context.arcTo(right, bottom, right - r, bottom, r);

  if (tail !== undefined && tailOnBottom) {
    context.lineTo(tailBaseX + tailHalf, bottom);
    context.lineTo(tail.tipX, tail.tipY);
    context.lineTo(tailBaseX - tailHalf, bottom);
  }

  context.lineTo(x + r, bottom);
  context.arcTo(x, bottom, x, bottom - r, r);
  context.lineTo(x, y + r);
  context.arcTo(x, y, x + r, y, r);
  context.closePath();
}

/** Clamp the tail base into the flat edge span; a plate too narrow to host it centers the base. */
function clampTailBase(tipX: number, min: number, max: number): number {
  if (min > max) return (min + max) / 2;

  return Math.max(min, Math.min(max, tipX));
}
