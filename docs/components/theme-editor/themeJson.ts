import type { ChartTheme, ThemeConfig } from '@wick-charts/react';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

const HEX6_RE = /^#[0-9a-f]{6}$/i;
const HEX3_RE = /^#[0-9a-f]{3}$/i;

let sharedCanvasCtx: CanvasRenderingContext2D | null | undefined;

function getSharedCtx(): CanvasRenderingContext2D | null {
  if (sharedCanvasCtx !== undefined) return sharedCanvasCtx;
  if (typeof document === 'undefined') {
    sharedCanvasCtx = null;
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  sharedCanvasCtx = canvas.getContext('2d', { willReadFrequently: true });

  return sharedCanvasCtx;
}

/**
 * Resolve any browser-parseable CSS color (hex / rgb / rgba / hsl / hsla /
 * named / oklch / …) to a 6-digit hex string. Alpha is dropped.
 *
 * Used to normalize `background` (and other hex-sensitive fields) before
 * handing the JSON to `createTheme`, whose internals assume `#RRGGBB`
 * (`isDarkBg` / `hexToRgba` / `lightenHex` / `darkenHex`). Non-hex inputs
 * would otherwise produce `rgba(NaN, NaN, NaN, …)` for derived defaults.
 */
export function toHexColor(v: string): string | null {
  const t = v.trim();
  if (HEX6_RE.test(t)) return t.toLowerCase();
  if (HEX3_RE.test(t)) return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`.toLowerCase();

  const ctx = getSharedCtx();
  if (!ctx) return null;

  ctx.clearRect(0, 0, 1, 1);
  // Double-assign so invalid input doesn't silently carry a prior fillStyle:
  // the first write resets the state, the second is the actual parse attempt.
  ctx.fillStyle = '#000000';
  ctx.fillStyle = t;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  if (a === 0) return null;

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Normalize the JSON produced by `themeToJson` / the editor into a valid
 * `ThemeConfig`. Coerces hex-required fields (`background`, `line.color`) from
 * any CSS color format to `#RRGGBB`. Returns `null` if `background` is absent
 * or unresolvable so callers can fall back safely.
 *
 * Non-hex-required fields (grid, tooltip, crosshair, …) are passed through
 * untouched — createTheme stores them verbatim, so `rgba(…)` and similar stay
 * usable.
 */
/** `body` must be a string or a `[string, string]` tuple. Anything else is dropped. */
function normalizeBody(body: unknown): string | [string, string] | undefined {
  if (typeof body === 'string') return body;
  if (Array.isArray(body) && body.length === 2 && typeof body[0] === 'string' && typeof body[1] === 'string') {
    return [body[0], body[1]];
  }

  return undefined;
}

function normalizeDirection(dir: unknown): { body?: string | [string, string]; wick?: string } | undefined {
  if (!dir || typeof dir !== 'object' || Array.isArray(dir)) return undefined;
  const rec = dir as Record<string, unknown>;
  const out: { body?: string | [string, string]; wick?: string } = {};
  const body = normalizeBody(rec.body);
  if (body !== undefined) out.body = body;
  if (typeof rec.wick === 'string') out.wick = rec.wick;

  return Object.keys(out).length > 0 ? out : undefined;
}

export function normalizeThemeConfig(value: JsonValue): ThemeConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const cfg = value as Record<string, unknown>;
  if (typeof cfg.background !== 'string') return null;

  const bg = toHexColor(cfg.background);
  if (!bg) return null;

  const out: Record<string, unknown> = { ...cfg, background: bg };

  const line = cfg.line;
  if (line && typeof line === 'object' && !Array.isArray(line)) {
    const lineRec = line as Record<string, unknown>;
    if (typeof lineRec.color === 'string') {
      const lineHex = toHexColor(lineRec.color);
      if (lineHex) out.line = { ...lineRec, color: lineHex };
    }
  }

  // Candlestick body tuples must be exactly [string, string]; any malformed
  // shape is dropped so createTheme falls back to defaults instead of getting
  // `undefined`/`NaN` into the renderer.
  const candle = cfg.candlestick;
  if (candle && typeof candle === 'object' && !Array.isArray(candle)) {
    const rec = candle as Record<string, unknown>;
    const up = normalizeDirection(rec.up);
    const down = normalizeDirection(rec.down);
    if (up || down) out.candlestick = { ...(up ? { up } : {}), ...(down ? { down } : {}) };
    else delete out.candlestick;
  }

  return out as unknown as ThemeConfig;
}

/**
 * Extract the editable surface of a `ChartTheme` into the `createTheme` arg
 * shape. Round-trips through `createTheme` so edits drive previews and the
 * whole-page override.
 */
function bodyToJson(body: string | [string, string]): JsonValue {
  return Array.isArray(body) ? [body[0], body[1]] : body;
}

export function themeToJson(t: ChartTheme): JsonValue {
  const axis: Record<string, JsonValue> = { fontSize: t.axis.fontSize, textColor: t.axis.textColor };
  if (t.axis.x) axis.x = { ...t.axis.x } as JsonValue;
  if (t.axis.y) axis.y = { ...t.axis.y } as JsonValue;

  return {
    background: t.background,
    chartGradient: [t.chartGradient[0], t.chartGradient[1]],
    typography: {
      fontFamily: t.typography.fontFamily,
      fontSize: t.typography.fontSize,
    },
    grid: { color: t.grid.color, style: t.grid.style },
    candlestick: {
      up: { body: bodyToJson(t.candlestick.up.body), wick: t.candlestick.up.wick },
      down: { body: bodyToJson(t.candlestick.down.body), wick: t.candlestick.down.wick },
    },
    line: { color: t.line.color, width: t.line.width },
    seriesColors: [...t.seriesColors],
    bands: { upper: t.bands.upper, lower: t.bands.lower },
    crosshair: {
      color: t.crosshair.color,
      labelBackground: t.crosshair.labelBackground,
      labelTextColor: t.crosshair.labelTextColor,
    },
    axis,
    yLabel: {
      fontSize: t.yLabel.fontSize,
      upBackground: t.yLabel.upBackground,
      downBackground: t.yLabel.downBackground,
      neutralBackground: t.yLabel.neutralBackground,
      textColor: t.yLabel.textColor,
    },
    tooltip: {
      fontSize: t.tooltip.fontSize,
      background: t.tooltip.background,
      textColor: t.tooltip.textColor,
      borderColor: t.tooltip.borderColor,
    },
  };
}
