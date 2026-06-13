import type { ValueColor } from '../types';

/** Resolve a {@link ValueColor} to a concrete color string for a given datum value. */
export function resolveColor(color: ValueColor, value: number): string {
  return typeof color === 'function' ? color(value) : color;
}

/** Parse-once color cache — hex colors come from theme config and don't change per-frame. */
const rgbaCache = new Map<string, string>();
const lightenCache = new Map<string, string>();
const darkenCache = new Map<string, string>();

function parseHex(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** Expand a `#rgb` shorthand to `#rrggbb`. Any other input passes through. The
 *  fixed-slice {@link parseHex} reads NaN channels on a 4-char shorthand, so it
 *  must be expanded before parsing. */
function expandShorthandHex(hex: string): string {
  if (!hex.startsWith('#') || hex.length !== 4) return hex;

  return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
}

function toHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function hexToRgba(hex: string, alpha: number): string {
  if (hex.startsWith('rgba')) return hex.replace(/[\d.]+\)\s*$/, `${alpha})`);
  if (hex.startsWith('rgb(')) return hex.replace(/^rgb\((.*)\)$/i, `rgba($1, ${alpha})`);
  const key = hex + alpha;
  const cached = rgbaCache.get(key);
  if (cached) return cached;

  const [r, g, b] = parseHex(expandShorthandHex(hex));
  // A non-hex color (named, hsl(), oklch(), malformed) parses to NaN channels —
  // canvas silently rejects `rgba(NaN, …)` and keeps the previous fillStyle. Fall
  // back to the solid color so the caller still gets the right hue (no alpha blend).
  const result = Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) ? hex : `rgba(${r}, ${g}, ${b}, ${alpha})`;
  rgbaCache.set(key, result);

  return result;
}

export function lighten(hex: string, amount: number): string {
  const key = hex + amount;
  let result = lightenCache.get(key);
  if (result) return result;
  const [r, g, b] = parseHex(hex);
  result = toHex(
    Math.min(255, Math.round(r + (255 - r) * amount)),
    Math.min(255, Math.round(g + (255 - g) * amount)),
    Math.min(255, Math.round(b + (255 - b) * amount)),
  );
  lightenCache.set(key, result);
  return result;
}

export function darken(hex: string, amount: number): string {
  const key = hex + amount;
  let result = darkenCache.get(key);
  if (result) return result;
  const [r, g, b] = parseHex(hex);
  result = toHex(
    Math.max(0, Math.round(r * (1 - amount))),
    Math.max(0, Math.round(g * (1 - amount))),
    Math.max(0, Math.round(b * (1 - amount))),
  );
  darkenCache.set(key, result);
  return result;
}
