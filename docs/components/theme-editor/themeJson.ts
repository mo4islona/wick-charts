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

  return out as unknown as ThemeConfig;
}

/**
 * Extract the editable surface of a `ChartTheme` into the `createTheme` arg
 * shape. Round-trips through `createTheme` so edits drive previews and the
 * whole-page override.
 */
export function themeToJson(t: ChartTheme): JsonValue {
  return {
    background: t.background,
    chartGradient: [t.chartGradient[0], t.chartGradient[1]],
    typography: {
      fontFamily: t.typography.fontFamily,
      fontSize: t.typography.fontSize,
      axisFontSize: t.typography.axisFontSize,
      yFontSize: t.typography.yFontSize,
      tooltipFontSize: t.typography.tooltipFontSize,
    },
    grid: { color: t.grid.color, style: t.grid.style },
    candlestick: {
      upColor: t.candlestick.upColor,
      downColor: t.candlestick.downColor,
      wickUpColor: t.candlestick.wickUpColor,
      wickDownColor: t.candlestick.wickDownColor,
    },
    line: { color: t.line.color, width: t.line.width },
    seriesColors: [...t.seriesColors],
    bands: { upper: t.bands.upper, lower: t.bands.lower },
    crosshair: {
      color: t.crosshair.color,
      labelBackground: t.crosshair.labelBackground,
      labelTextColor: t.crosshair.labelTextColor,
    },
    axis: { textColor: t.axis.textColor },
    yLabel: {
      upBackground: t.yLabel.upBackground,
      downBackground: t.yLabel.downBackground,
      neutralBackground: t.yLabel.neutralBackground,
      textColor: t.yLabel.textColor,
    },
    tooltip: {
      background: t.tooltip.background,
      textColor: t.tooltip.textColor,
      borderColor: t.tooltip.borderColor,
    },
  };
}
