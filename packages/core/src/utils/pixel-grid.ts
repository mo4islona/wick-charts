/**
 * Crisp-stroke geometry shared by the canvas grid and the DOM axis labels —
 * resolving a value differently drifts the label off its line by half a pixel.
 */

/** Stroke width in device pixels: 1 CSS px, scaled so it stays crisp at any DPR. */
export function crispLineWidth(pixelRatio: number): number {
  return Math.max(1, Math.round(pixelRatio));
}

/** Offset to the stroke's center: odd widths need the half-pixel nudge, even ones don't. */
export function crispCenterOffset(pixelRatio: number): number {
  return crispLineWidth(pixelRatio) % 2 === 1 ? 0.5 : 0;
}
