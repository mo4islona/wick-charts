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

/**
 * Extract `[r, g, b]` channels from `#rgb`, `#rrggbb`, `rgb(...)`, or
 * `rgba(...)`. Returns `null` for anything else (named colors, `hsl()`,
 * gradients, malformed input) — callers pick their own fallback.
 */
function parseColorChannels(color: string): [number, number, number] | null {
  const hex = expandShorthandHex(color);
  if (hex.startsWith('#')) {
    if (hex.length < 7) return null;

    const [r, g, b] = parseHex(hex);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;

    return [r, g, b];
  }

  const rgb = color.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];

  return null;
}

/**
 * `true` when the color reads as light — Rec. 601 luma above 150. Shared by
 * renderers picking a readable ink over an arbitrary fill (pie slice labels,
 * heatmap cell labels). Non-parseable colors (named, `hsl()`) report dark,
 * which keeps the default white ink.
 */
export function isLightColor(color: string): boolean {
  const channels = parseColorChannels(color);
  if (!channels) return false;

  const [r, g, b] = channels;

  return r * 0.299 + g * 0.587 + b * 0.114 > 150;
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

// --- Perceptual (OKLab) interpolation --------------------------------------
//
// Heatmap ramps interpolate in OKLab rather than raw RGB: naive RGB lerps
// drift toward muddy grays in the middle of a ramp, while OKLab keeps hue and
// perceived lightness moving evenly — the property a sequential magnitude
// scale depends on.

/**
 * Unlike the lighten/darken caches (keyed by a handful of theme colors),
 * `mixColors` is fed per-cell fills and 256-step quantized `t` values — a
 * long-running live feed with explicit cell colors grows the key space
 * indefinitely. Reset on overflow: a rebuild costs one frame of misses.
 */
const MIX_CACHE_LIMIT = 10_000;
const mixCache = new Map<string, string>();

function srgbToLinear(c: number): number {
  const v = c / 255;

  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(v: number): number {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;

  return Math.max(0, Math.min(255, Math.round(c * 255)));
}

function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb(L: number, a: number, bb: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * bb) ** 3;

  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** Alpha channel of an `rgba(...)` input, `1` for everything else. */
function parseColorAlpha(color: string): number {
  const match = color.match(/^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/i);
  if (!match) return 1;

  const alpha = Number(match[1]);

  return Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
}

/**
 * Blend two colors perceptually (OKLab), `t` in [0, 1]. Accepts `#rgb`,
 * `#rrggbb`, and `rgb()/rgba()` inputs; anything else (named colors,
 * `hsl()`) falls back to a hard switch at `t = 0.5` — it never produces a
 * NaN canvas fill. An `rgba()` input's alpha interpolates linearly alongside
 * the OKLab channels — the result is an `rgba()` string whenever either
 * endpoint is translucent, an opaque hex otherwise. Results are cached on a
 * quantized `t` (1/256 steps), so per-frame per-cell sampling stays
 * allocation-free after the first frame.
 */
export function mixColors(from: string, to: string, t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const a = parseColorChannels(from);
  const b = parseColorChannels(to);
  if (!a || !b) return clamped < 0.5 ? from : to;

  const q = Math.round(clamped * 255);
  const key = `${from}\u0000${to}\u0000${q}`;
  const cached = mixCache.get(key);
  if (cached) return cached;

  const [ar, ag, ab] = a;
  const [br, bg2, bb] = b;
  const [la, aa, ba] = rgbToOklab(ar, ag, ab);
  const [lb2, ab2, bb2] = rgbToOklab(br, bg2, bb);

  const f = q / 255;
  const [r, g, bl] = oklabToRgb(la + (lb2 - la) * f, aa + (ab2 - aa) * f, ba + (bb2 - ba) * f);

  const alphaFrom = parseColorAlpha(from);
  const alphaTo = parseColorAlpha(to);
  let result: string;
  if (alphaFrom >= 1 && alphaTo >= 1) {
    result = toHex(r, g, bl);
  } else {
    const alpha = Math.round((alphaFrom + (alphaTo - alphaFrom) * f) * 1000) / 1000;
    result = `rgba(${r}, ${g}, ${bl}, ${alpha})`;
  }

  if (mixCache.size >= MIX_CACHE_LIMIT) mixCache.clear();
  mixCache.set(key, result);

  return result;
}

/**
 * Theme-derived sequential heatmap ramp: a faint accent wash just off the
 * surface up to the full accent. Anchoring the low stop to the background
 * makes the ramp flip with theme polarity automatically. Single source for
 * `createTheme` and the renderer's no-token fallback — the two must agree
 * or hand-built theme literals render a different wash than presets.
 */
export function deriveHeatmapRamp(background: string, accent: string): [string, string] {
  return [mixColors(background, accent, 0.12), accent];
}

/**
 * Sample a multi-stop ramp at `t` in [0, 1] with perceptual interpolation
 * between adjacent stops. A single-stop ramp returns that stop; an empty
 * ramp returns transparent black (defensive — resolved options never allow it).
 */
export function sampleRamp(stops: readonly string[], t: number): string {
  if (stops.length === 0) return '#000000';
  if (stops.length === 1) return stops[0];

  // NaN survives min/max clamping and would index `stops[NaN]` — pin it low.
  const clamped = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0;
  const scaled = clamped * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));

  return mixColors(stops[index], stops[index + 1], scaled - index);
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
