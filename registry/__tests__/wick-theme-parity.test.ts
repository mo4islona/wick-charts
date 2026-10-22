import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { type WickThemeTokens, themeFromTokens as reactTheme } from '../shadcn/hooks/use-wick-theme';
import { themeFromTokens as vueTheme } from '../shadcn-vue/composables/useWickTheme';

// The React hook and the Vue composable carry the same color code; these tests keep the two copies in step.
const here = dirname(fileURLToPath(import.meta.url));
const REACT_SOURCE = resolve(here, '../shadcn/hooks/use-wick-theme.ts');
const VUE_SOURCE = resolve(here, '../shadcn-vue/composables/useWickTheme.ts');

// happy-dom has no 2D canvas: the stub "paints" a color by looking it up here.
const RGBA: Record<string, [number, number, number, number]> = {
  '#ffffff': [255, 255, 255, 255],
  'rgb(255, 255, 255)': [255, 255, 255, 255],
  '#0a0a0a': [10, 10, 10, 255],
  'rgb(23, 23, 23)': [23, 23, 23, 255],
  'rgba(23, 23, 23, 0.5)': [23, 23, 23, 128],
  '#fafafa': [250, 250, 250, 255],
  '#737373': [115, 115, 115, 255],
  '#a1a1a1': [161, 161, 161, 255],
  '#e5e5e5': [229, 229, 229, 255],
  'rgba(255, 255, 255, 0.1)': [255, 255, 255, 26],
  '#d4d4d4': [212, 212, 212, 255],
  '#a3a3a3': [163, 163, 163, 255],
  '#525252': [82, 82, 82, 255],
  '#404040': [64, 64, 64, 255],
  '#e76e50': [231, 110, 80, 255],
  '#2a9d90': [42, 157, 144, 255],
  '#274754': [39, 71, 84, 255],
  'hsl(12 76% 61%)': [231, 110, 80, 255],
  'hsl(173 58% 39%)': [42, 157, 144, 255],
};

const RAMP = ['#d4d4d4', '#a3a3a3', '#737373', '#525252', '#404040'];

const LIGHT: WickThemeTokens = {
  surfaces: ['rgb(255, 255, 255)'],
  background: '#ffffff',
  foreground: '#0a0a0a',
  mutedForeground: '#737373',
  border: '#e5e5e5',
  chart: RAMP,
  fontFamily: 'Geist, sans-serif',
};

const DARK: WickThemeTokens = {
  surfaces: ['rgb(23, 23, 23)'],
  background: '#0a0a0a',
  foreground: '#fafafa',
  mutedForeground: '#a1a1a1',
  border: 'rgba(255, 255, 255, 0.1)',
  chart: RAMP,
  fontFamily: 'Geist, sans-serif',
};

const FIXTURES: [string, WickThemeTokens][] = [
  ['light card', LIGHT],
  ['dark card', DARK],
  ['translucent card', { ...DARK, surfaces: ['rgba(23, 23, 23, 0.5)'] }],
  ['multi-hue palette', { ...LIGHT, chart: ['#e76e50', '#2a9d90', '#274754'] }],
  ['Tailwind 3 HSL channels', { ...LIGHT, chart: ['12 76% 61%', '173 58% 39%'] }],
  ['no surfaces', { ...LIGHT, surfaces: [] }],
  ['no tokens', { ...LIGHT, surfaces: [], background: '', chart: [] }],
];

let painted: [number, number, number, number] = [0, 0, 0, 0];
const originalGetContext = HTMLCanvasElement.prototype.getContext;

beforeAll(() => {
  const context = {
    clearRect: () => {},
    fillRect: () => {},
    set fillStyle(color: string) {
      painted = RGBA[color] ?? [0, 0, 0, 0];
    },
    getImageData: () => ({ data: Uint8ClampedArray.from(painted) }),
  };

  HTMLCanvasElement.prototype.getContext = (() => context) as unknown as HTMLCanvasElement['getContext'];
  vi.stubGlobal('CSS', { supports: (_property: string, value: string) => value in RGBA });
});

afterAll(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  vi.unstubAllGlobals();
});

function contrastOf(hexA: string, hexB: string): number {
  const luminance = (hex: string) => {
    const linear = [1, 3, 5].map((start) => {
      const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;

      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    const [r = 0, g = 0, b = 0] = linear;

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [darker, lighter] = [luminance(hexA), luminance(hexB)].sort((x, y) => x - y);

  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

// The default theme holds closures (`bar.color`); two equal closures compare by their source.
function comparable(theme: unknown): unknown {
  return JSON.parse(JSON.stringify(theme, (_key, value) => (typeof value === 'function' ? String(value) : value)));
}

function sharedPart(path: string): string {
  const source = readFileSync(path, 'utf8');
  const tokensStart = source.indexOf('/** CSS variables the theme is built from');
  const tokensEnd = source.indexOf('let probe');
  const colorCodeStart = source.indexOf('export function themeFromTokens(');

  return `${source.slice(tokensStart, tokensEnd)}\n${source.slice(colorCodeStart)}`;
}

describe('wick-theme in the React and Vue registries', () => {
  it.each(FIXTURES)('builds the same theme for a %s', (_name, tokens) => {
    expect(comparable(vueTheme(tokens))).toEqual(comparable(reactTheme(tokens)));
  });

  it('reads the tokens, not the fallback theme', () => {
    expect(reactTheme(LIGHT).background).toBe('#ffffff');
    expect(reactTheme(DARK).background).toBe('#171717');
    expect(reactTheme({ ...DARK, surfaces: ['rgba(23, 23, 23, 0.5)'] }).background).toBe('#111111');
  });

  it.each([
    ['light', LIGHT],
    ['dark', DARK],
  ] as const)('keeps every series color apart from a %s card', (_mode, tokens) => {
    const theme = reactTheme(tokens);
    const contrasts = theme.seriesColors.map((color) => contrastOf(color, theme.background));

    expect(Math.min(...contrasts)).toBeGreaterThanOrEqual(2);
    // The ramp keeps its order: no two lifted colors land on the same shade.
    expect(new Set(theme.seriesColors).size).toBe(RAMP.length);
  });

  it('keeps the token reading and color code identical', () => {
    const shared = sharedPart(REACT_SOURCE);

    expect(shared.length).toBeGreaterThan(2000);
    expect(sharedPart(VUE_SOURCE)).toBe(shared);
  });
});
