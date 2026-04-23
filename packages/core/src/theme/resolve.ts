import type { ChartTheme } from './types';

/**
 * Resolve the effective font size for a given axis, falling back to the
 * shared `axis.fontSize` default when no per-axis override is set.
 *
 * Pass `'x'` or `'y'` for axis-specific surfaces (TimeAxis, YAxis). Omit the
 * argument for non-axis label surfaces that share the same size (Legend,
 * Crosshair label, Sparkline ticks).
 */
export function resolveAxisFontSize(theme: ChartTheme, axis?: 'x' | 'y'): number {
  if (axis === 'x' && theme.axis.x?.fontSize !== undefined) return theme.axis.x.fontSize;
  if (axis === 'y' && theme.axis.y?.fontSize !== undefined) return theme.axis.y.fontSize;

  return theme.axis.fontSize;
}

/**
 * Resolve the effective text color for a given axis, falling back to the
 * shared `axis.textColor` default when no per-axis override is set.
 */
export function resolveAxisTextColor(theme: ChartTheme, axis?: 'x' | 'y'): string {
  if (axis === 'x' && theme.axis.x?.textColor !== undefined) return theme.axis.x.textColor;
  if (axis === 'y' && theme.axis.y?.textColor !== undefined) return theme.axis.y.textColor;

  return theme.axis.textColor;
}

/**
 * Pick a single flat color from a candlestick body that may be either a single
 * color or a `[top, bottom]` gradient tuple. Use this wherever a solid color
 * is needed — tooltip text, legend swatches, sparkline trend indicator,
 * yLabel backgrounds, volume tinting, etc.
 *
 * For tuples produced by `autoGradient(c)` the canonical `c` is preserved on
 * a non-enumerable `source` property and returned as-is — this prevents the
 * lightened top stop from silently replacing the candle's perceived color
 * across dependent UI. Plain user tuples without a source fall back to the
 * top stop.
 */
export function resolveCandlestickBodyColor(body: string | [string, string]): string {
  if (Array.isArray(body)) {
    const source = (body as { source?: string }).source;
    return source ?? body[0];
  }

  return body;
}
