import type { HoverInfo, PieHole, SliceInfo } from './series/types';
import type { ChartTheme } from './theme/types';
import type { ValueFormatter } from './utils/format';

/** What the default `<PieCenter>` shows: the total, or the hovered slice. */
export interface PieCenterText {
  value: string;
  caption: string | null;
}

/** Where `<PieCenter>` sits: the square around the hole, in the overlay's CSS pixels. */
export interface PieCenterBox {
  left: number;
  top: number;
  size: number;
  valueFontSize: number;
  captionFontSize: number;
}

/** Sum of the slice values; a slice below zero adds nothing, as on the disk. */
export function pieTotal(slices: readonly SliceInfo[]): number {
  let total = 0;
  for (const slice of slices) {
    total += Math.max(0, slice.value);
  }

  return total;
}

export function pieCenterText(args: {
  slices: readonly SliceInfo[];
  hovered: HoverInfo | null;
  format: ValueFormatter;
  label: string | undefined;
}): PieCenterText {
  const { hovered, format, label } = args;
  if (hovered) {
    return { value: format(hovered.value), caption: `${hovered.label} · ${hovered.percent.toFixed(1)}%` };
  }

  return { value: format(pieTotal(args.slices)), caption: label ?? null };
}

// Bold digits average about 0.62em wide; the text keeps a small margin inside the box.
const VALUE_CHAR_WIDTH_EM = 0.62;
const VALUE_WIDTH_SHARE = 0.92;

/** Font size that keeps `value` on one line inside the box, never under the caption size. */
export function pieCenterValueFontSize(box: PieCenterBox, value: string): number {
  const fitted = (box.size * VALUE_WIDTH_SHARE) / (Math.max(1, value.length) * VALUE_CHAR_WIDTH_EM);

  return Math.max(box.captionFontSize, Math.floor(Math.min(box.valueFontSize, fitted)));
}

/** Null for a pie without a hole: there is no room for text. */
export function pieCenterBox(hole: PieHole, theme: ChartTheme): PieCenterBox | null {
  if (hole.innerRadius <= 0) return null;

  // The text block must fit the square inscribed in the circle, not the circle's bounding box.
  const size = hole.innerRadius * Math.SQRT2;
  const base = theme.typography.fontSize;
  const valueFontSize = Math.round(Math.min(Math.max(size * 0.24, base), base * 3));

  return {
    left: hole.x - size / 2,
    top: hole.y - size / 2,
    size,
    valueFontSize,
    captionFontSize: Math.max(10, base - 1),
  };
}
