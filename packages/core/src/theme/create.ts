import { resolveCandlestickBodyColor } from './resolve';
import type { ChartTheme } from './types';

export interface ThemePreset {
  name: string;
  description?: string;
  fontUrl: string | null;
  theme: ChartTheme;
  dark: boolean;
  /** Optional CSS background-image for the page */
  backgroundImage?: string;
  backgroundSize?: string;
}

/**
 * Input config for {@link createTheme}. Mirrors the structure of {@link ChartTheme}
 * but everything is optional except `background`. Missing values are derived automatically.
 */
export interface ThemeConfig {
  name?: string;
  description?: string;
  background: string;
  chartGradient?: [string, string];
  typography?: Partial<ChartTheme['typography']>;
  grid?: Partial<ChartTheme['grid']>;
  candlestick?: {
    up?: Partial<ChartTheme['candlestick']['up']>;
    down?: Partial<ChartTheme['candlestick']['down']>;
  };
  line?: Partial<ChartTheme['line']>;
  seriesColors?: string[];
  bands?: Partial<ChartTheme['bands']>;
  crosshair?: Partial<ChartTheme['crosshair']>;
  axis?: Partial<ChartTheme['axis']>;
  yLabel?: Partial<ChartTheme['yLabel']>;
  tooltip?: Partial<ChartTheme['tooltip']>;
  /** URL to load the font (e.g. Google Fonts). */
  fontUrl?: string | null;
}

/** Detect dark mode using ITU-R BT.601 luma from the background hex color. */
function isDarkBg(bg: string): boolean {
  return (
    parseInt(bg.slice(1, 3), 16) * 0.299 + parseInt(bg.slice(3, 5), 16) * 0.587 + parseInt(bg.slice(5, 7), 16) * 0.114 <
    128
  );
}

/**
 * Build a complete {@link ThemePreset} from a partial config.
 * Only `background` is required — everything else is derived from it.
 */
export function createTheme(config: ThemeConfig): ThemePreset {
  const { background: bg, name = 'Custom', description, fontUrl = null } = config;
  const dark = isDarkBg(bg);

  // Default palette based on dark/light
  const defFg = dark ? '#d1d4dc' : '#24292f';
  const defDim = dark ? '#787b86' : '#8b949e';
  const defUp = dark ? '#26a69a' : '#2da44e';
  const defDown = dark ? '#ef5350' : '#cf222e';
  const defLine = dark ? '#2962ff' : '#0969da';
  const defGrid = dark ? 'rgba(42,46,57,0.6)' : 'rgba(200,200,200,0.5)';
  const defCrosshair = dark ? 'rgba(150,150,150,0.5)' : 'rgba(170,170,170,0.3)';
  const defCrosshairBg = dark ? lightenHex(bg, 0.1) : darkenHex(bg, 0.05);
  const defTooltipBg = dark ? hexToRgba(bg, 0.92) : hexToRgba(bg, 0.95);
  const defTooltipBorder = dark ? hexToRgba(lightenHex(bg, 0.15), 0.6) : 'rgba(200,200,200,0.5)';
  const defFont = GEIST;

  const upBody = config.candlestick?.up?.body ?? defUp;
  const downBody = config.candlestick?.down?.body ?? defDown;
  // For scalar fallbacks (yLabel backgrounds, bands, wick default), flatten a
  // gradient tuple to its top stop.
  const upBase = resolveCandlestickBodyColor(upBody);
  const downBase = resolveCandlestickBodyColor(downBody);
  const lineColor = config.line?.color ?? defLine;
  const fg = config.tooltip?.textColor ?? defFg;
  const dim = config.axis?.textColor ?? defDim;
  const font = config.typography?.fontFamily ?? defFont;
  const baseFontSize = config.typography?.fontSize ?? 12;

  const theme: ChartTheme = {
    background: bg,
    chartGradient:
      config.chartGradient ?? (dark ? [lightenHex(bg, 0.04), darkenHex(bg, 0.06)] : [lightenHex(bg, 0.06), bg]),
    typography: {
      fontFamily: font,
      fontSize: baseFontSize,
    },
    grid: {
      color: config.grid?.color ?? defGrid,
      style: config.grid?.style ?? 'dashed',
    },
    candlestick: {
      up: {
        body: upBody,
        wick: config.candlestick?.up?.wick ?? upBase,
      },
      down: {
        body: downBody,
        wick: config.candlestick?.down?.wick ?? downBase,
      },
    },
    line: {
      color: lineColor,
      width: config.line?.width ?? 1,
      areaTopColor: config.line?.areaTopColor ?? hexToRgba(lineColor, 0.08),
      areaBottomColor: config.line?.areaBottomColor ?? hexToRgba(lineColor, 0.01),
    },
    seriesColors: config.seriesColors ?? [lineColor, defUp, defDown],
    bands: {
      upper: config.bands?.upper ?? lineColor,
      lower: config.bands?.lower ?? downBase,
    },
    crosshair: {
      color: config.crosshair?.color ?? defCrosshair,
      labelBackground: config.crosshair?.labelBackground ?? defCrosshairBg,
      labelTextColor: config.crosshair?.labelTextColor ?? fg,
    },
    axis: {
      fontSize: config.axis?.fontSize ?? 10,
      textColor: dim,
      // Shallow-copy the override so later caller mutations don't leak into the theme.
      ...(config.axis?.x ? { x: { ...config.axis.x } } : {}),
      ...(config.axis?.y ? { y: { ...config.axis.y } } : {}),
    },
    yLabel: {
      fontSize: config.yLabel?.fontSize ?? 11,
      upBackground: config.yLabel?.upBackground ?? upBase,
      downBackground: config.yLabel?.downBackground ?? downBase,
      neutralBackground: config.yLabel?.neutralBackground ?? defCrosshairBg,
      textColor: config.yLabel?.textColor ?? '#ffffff',
    },
    tooltip: {
      fontSize: config.tooltip?.fontSize ?? baseFontSize,
      background: config.tooltip?.background ?? defTooltipBg,
      textColor: fg,
      borderColor: config.tooltip?.borderColor ?? defTooltipBorder,
    },
  };

  return { name, description, fontUrl, dark, theme };
}

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function lightenHex(hex: string, amount: number): string {
  if (!hex.startsWith('#')) return hex;
  const r = Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) + 255 * amount));
  const g = Math.min(255, Math.round(parseInt(hex.slice(3, 5), 16) + 255 * amount));
  const b = Math.min(255, Math.round(parseInt(hex.slice(5, 7), 16) + 255 * amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function darkenHex(hex: string, amount: number): string {
  if (!hex.startsWith('#')) return hex;
  const r = Math.max(0, Math.round(parseInt(hex.slice(1, 3), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(hex.slice(3, 5), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(hex.slice(5, 7), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Tuple returned by {@link autoGradient}. The non-enumerable `source` property
 * carries the original canonical color so scalar-fallback consumers
 * (yLabel backgrounds, bands, default wick, volume tint) can recover it via
 * {@link resolveCandlestickBodyColor} instead of picking the lightened top
 * stop. `JSON.stringify` drops the marker, which is fine because
 * `themeToJson` serializes all dependent scalar fields explicitly.
 */
export type AutoGradientTuple = [string, string] & { readonly source?: string };

/**
 * Build a 2-stop candle-body gradient around a single hex color — a lightened
 * top stop and a darkened bottom stop. Presets use this to get a subtle
 * vertical lift without hand-picking both ends.
 *
 *     candlestick: { up: { body: autoGradient('#089981'), wick: '#089981' } }
 *
 * The input must be `#rrggbb`; other CSS color forms are returned as a flat
 * `[color, color]` tuple because the lighten/darken math requires hex.
 *
 * The returned tuple carries the source color on a non-enumerable `source`
 * property so {@link resolveCandlestickBodyColor} can recover it for scalar
 * fallbacks (yLabel backgrounds, bands, volume tint) instead of picking the
 * lightened top stop.
 */
export function autoGradient(color: string): AutoGradientTuple {
  const isHex = color.startsWith('#') && color.length === 7;
  const tuple: [string, string] = isHex ? [lightenHex(color, 0.2), darkenHex(color, 0.15)] : [color, color];
  Object.defineProperty(tuple, 'source', { value: color, enumerable: false });

  return tuple as AutoGradientTuple;
}

// Common font stacks
export const MONO = "'JetBrains Mono', 'Fira Code', monospace";
export const MONO_URL = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap';
export const GEIST = "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif";
export const GEIST_URL = 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap';
export const ROBOTO = "'Roboto Mono', monospace";
export const ROBOTO_URL = 'https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500;600&display=swap';
export const IBM = "'IBM Plex Mono', monospace";
export const IBM_URL = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap';
export const FIRA = "'Fira Code', monospace";
export const FIRA_URL = 'https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&display=swap';
export const SOURCE_CODE = "'Source Code Pro', monospace";
export const SOURCE_CODE_URL = 'https://fonts.googleapis.com/css2?family=Source+Code+Pro:wght@400;500;600&display=swap';
export const SPACE_MONO = "'Space Mono', monospace";
export const SPACE_MONO_URL = 'https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap';
export const JAKARTA = "'Plus Jakarta Sans', sans-serif";
export const JAKARTA_URL =
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap';
export const CAVEAT = "'Caveat', 'Comic Sans MS', cursive";
export const CAVEAT_URL = 'https://fonts.googleapis.com/css2?family=Caveat:wght@400;500;600;700&display=swap';
