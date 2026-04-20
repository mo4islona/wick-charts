import type { CSSProperties } from 'react';

import type { ChartTheme } from '@wick-charts/react';

function hexLuminance(hex: string): number {
  const m = hex.match(/^#([0-9a-f]{3,8})$/i);
  if (!m) return 0;
  const h = m[1];
  const r = h.length === 3 ? Number.parseInt(h[0] + h[0], 16) : Number.parseInt(h.slice(0, 2), 16);
  const g = h.length === 3 ? Number.parseInt(h[1] + h[1], 16) : Number.parseInt(h.slice(2, 4), 16);
  const b = h.length === 3 ? Number.parseInt(h[2] + h[2], 16) : Number.parseInt(h.slice(4, 6), 16);

  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * CSS variables for the `.wick-playground` root — drives surface colors,
 * code-panel palette, and syntax tokens from the active ChartTheme.
 */
export function themeSurfaceVars(theme: ChartTheme): CSSProperties {
  const text = theme.tooltip.textColor;
  const border = theme.tooltip.borderColor;
  const accent = theme.seriesColors[0] ?? theme.line.color;
  const isLight = hexLuminance(theme.background) > 0.55;
  // Code panel surface: semi-transparent tint of crosshair.labelBackground
  // over the parent bg (matches the /hexToRgba(..., 0.3)/ look the old
  // Dashboard used). Keeps the theme hue, subtle recession, no heavy
  // border needed.
  const codeBg = `color-mix(in oklab, ${theme.crosshair.labelBackground} 35%, transparent)`;
  // Token palettes — the exact pair the old main/controls.tsx shipped,
  // so code snippets look identical to pre-redesign.
  const tokens: Record<string, string> = isLight
    ? {
        '--tok-tag': '#0369a1',
        '--tok-class-name': '#0369a1',
        '--tok-attr': '#6d28d9',
        '--tok-str': '#16653a',
        '--tok-num': '#b45309',
        '--tok-kw': '#7c3aed',
        '--tok-function': '#b45309',
        '--tok-brace': '#334155',
        '--tok-punct': '#64748b',
        '--tok-comment': '#94a3b8',
        '--tok-text': '#1e293b',
      }
    : {
        '--tok-tag': '#7dd3fc',
        '--tok-class-name': '#7dd3fc',
        '--tok-attr': '#c4b5fd',
        '--tok-str': '#86efac',
        '--tok-num': '#fbbf24',
        '--tok-kw': '#c4b5fd',
        '--tok-function': '#fbbf24',
        '--tok-brace': '#cbd5e1',
        '--tok-punct': '#64748b',
        '--tok-comment': '#64748b',
        '--tok-text': '#cbd5e1',
      };

  return {
    '--bg-0': theme.background,
    '--bg-1': theme.background,
    '--bg-2': theme.tooltip.background,
    '--bg-3': theme.crosshair.labelBackground,
    '--fg-1': text,
    '--fg-2': `color-mix(in oklab, ${text} 90%, transparent)`,
    '--fg-3': `color-mix(in oklab, ${text} 72%, transparent)`,
    '--fg-3.2': `color-mix(in oklab, ${text} 67%, transparent)`,
    '--fg-4': `color-mix(in oklab, ${text} 50%, transparent)`,
    '--line': border,
    '--line-soft': `color-mix(in oklab, ${border} 55%, transparent)`,
    '--accent': accent,
    '--code-bg': codeBg,
    '--code-fg': text,
    '--code-gutter': `color-mix(in oklab, ${text} 45%, transparent)`,
    '--code-line-hover': `color-mix(in oklab, ${text} 7%, transparent)`,
    '--code-border': border,
    '--code-btn-fg': `color-mix(in oklab, ${text} 65%, transparent)`,
    '--code-btn-fg-hover': text,
    '--code-btn-border-hover': border,
    ...tokens,
  } as CSSProperties;
}
