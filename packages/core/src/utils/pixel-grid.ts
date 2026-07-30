/**
 * Crisp-stroke geometry shared by the canvas grid and the DOM axis labels.
 *
 * Both surfaces must resolve a value to the *same* pixel or the label drifts
 * off its line by up to half a CSS pixel — visible as axis text that doesn't
 * sit on the gridline it names.
 */

/** Stroke width in device pixels: 1 CSS px, scaled so it stays crisp at any DPR. */
export function crispLineWidth(pixelRatio: number): number {
  return Math.max(1, Math.round(pixelRatio));
}

/**
 * Offset from a device-pixel boundary to the stroke's center. Odd widths need
 * the half-pixel nudge; even widths already straddle a boundary cleanly.
 */
export function crispCenterOffset(pixelRatio: number): number {
  return crispLineWidth(pixelRatio) % 2 === 1 ? 0.5 : 0;
}
