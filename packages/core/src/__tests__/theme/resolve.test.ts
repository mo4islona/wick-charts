import { describe, expect, it } from 'vitest';

import { autoGradient } from '../../theme/create';
import { resolveAxisFontSize, resolveAxisTextColor, resolveCandlestickBodyColor } from '../../theme/resolve';
import type { ChartTheme } from '../../theme/types';

function stubTheme(partial: Partial<ChartTheme['axis']> = {}): ChartTheme {
  return {
    background: '#000',
    chartGradient: ['#000', '#000'],
    typography: { fontFamily: 'sans', fontSize: 12 },
    grid: { color: '#000', style: 'solid' },
    candlestick: {
      up: { body: '#0f0', wick: '#0f0' },
      down: { body: '#f00', wick: '#f00' },
    },
    line: { color: '#00f', width: 1, areaTopColor: '#000', areaBottomColor: '#000' },
    seriesColors: ['#00f'],
    bands: { upper: '#00f', lower: '#f00' },
    crosshair: { color: '#333', labelBackground: '#444', labelTextColor: '#fff' },
    axis: { fontSize: 10, textColor: '#888', ...partial },
    yLabel: {
      fontSize: 11,
      upBackground: '#0f0',
      downBackground: '#f00',
      neutralBackground: '#444',
      textColor: '#fff',
    },
    tooltip: { fontSize: 12, background: '#000', textColor: '#fff', borderColor: '#222' },
    navigator: {
      height: 60,
      background: '#000',
      borderColor: '#222',
      line: { color: '#00f', width: 1, areaTopColor: '#000', areaBottomColor: '#000' },
      candlestick: {
        up: { body: '#0f0', wick: '#0f0' },
        down: { body: '#f00', wick: '#f00' },
      },
      window: { fill: 'rgba(0,0,255,0.16)', border: 'rgba(0,0,255,0.6)', borderWidth: 1 },
      handle: { color: 'rgba(0,0,255,0.75)', width: 2 },
      mask: { fill: 'rgba(0,0,0,0.35)' },
    },
  };
}

describe('resolveAxisFontSize', () => {
  it('returns the shared default when no override is set', () => {
    const t = stubTheme();
    expect(resolveAxisFontSize(t)).toBe(10);
    expect(resolveAxisFontSize(t, 'x')).toBe(10);
    expect(resolveAxisFontSize(t, 'y')).toBe(10);
  });

  it('returns the y override when passing "y"', () => {
    const t = stubTheme({ y: { fontSize: 14 } });
    expect(resolveAxisFontSize(t, 'y')).toBe(14);
    expect(resolveAxisFontSize(t, 'x')).toBe(10); // unchanged
    expect(resolveAxisFontSize(t)).toBe(10); // shared default, not the y override
  });

  it('returns the x override when passing "x"', () => {
    const t = stubTheme({ x: { fontSize: 9 } });
    expect(resolveAxisFontSize(t, 'x')).toBe(9);
    expect(resolveAxisFontSize(t, 'y')).toBe(10);
  });

  it('falls through when the override lacks the asked field', () => {
    const t = stubTheme({ y: { textColor: '#ccc' } }); // no fontSize
    expect(resolveAxisFontSize(t, 'y')).toBe(10);
  });
});

describe('resolveAxisTextColor', () => {
  it('prefers the per-axis textColor override over the shared default', () => {
    const t = stubTheme({ y: { textColor: '#abc' } });
    expect(resolveAxisTextColor(t, 'y')).toBe('#abc');
    expect(resolveAxisTextColor(t, 'x')).toBe('#888');
    expect(resolveAxisTextColor(t)).toBe('#888');
  });
});

describe('resolveCandlestickBodyColor', () => {
  it('passes a single color through unchanged', () => {
    expect(resolveCandlestickBodyColor('#112233')).toBe('#112233');
  });

  it('returns the top stop from a plain gradient tuple', () => {
    expect(resolveCandlestickBodyColor(['#aaff00', '#008800'])).toBe('#aaff00');
  });

  it("honors autoGradient's `source` so the canonical color is recovered (not the lightened top stop)", () => {
    const grad = autoGradient('#26a69a');
    // Sanity check: top stop really is lighter than the input.
    expect(grad[0]).not.toBe('#26a69a');
    // But the scalar fallback picks the canonical, not the lightened stop.
    expect(resolveCandlestickBodyColor(grad)).toBe('#26a69a');
  });
});

describe('autoGradient', () => {
  it('returns [lighten, darken] for a valid #rrggbb input', () => {
    const [top, bottom] = autoGradient('#808080');
    expect(top.startsWith('#')).toBe(true);
    expect(bottom.startsWith('#')).toBe(true);
    // The top stop is lighter than the input, the bottom is darker.
    const toGray = (h: string) => parseInt(h.slice(1, 3), 16);
    expect(toGray(top)).toBeGreaterThan(0x80);
    expect(toGray(bottom)).toBeLessThan(0x80);
  });

  it('returns a flat [c, c] tuple for 3-digit hex (not expanded)', () => {
    expect(autoGradient('#abc')).toEqual(['#abc', '#abc']);
  });

  it('returns a flat [c, c] tuple for rgb() input', () => {
    expect(autoGradient('rgb(10, 20, 30)')).toEqual(['rgb(10, 20, 30)', 'rgb(10, 20, 30)']);
  });

  it('returns a flat [c, c] tuple for named colors', () => {
    expect(autoGradient('tomato')).toEqual(['tomato', 'tomato']);
  });

  it('carries the source color as a non-enumerable marker for scalar recovery', () => {
    const grad = autoGradient('#26a69a');
    // Non-enumerable: JSON.stringify and Object.keys must NOT see it, so the
    // theme editor's round-trip serialization stays clean.
    expect(Object.keys(grad)).toEqual(['0', '1']);
    expect(JSON.parse(JSON.stringify(grad))).toEqual(Array.from(grad));
    // But direct access works, and `resolveCandlestickBodyColor` uses it.
    expect((grad as { source?: string }).source).toBe('#26a69a');
  });
});
