import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type JsonValue, normalizeThemeConfig, toHexColor } from '../components/theme-editor/themeJson';

// happy-dom's canvas has no real 2D context, so `toHexColor` can't parse CSS
// colors without help. We install a single stub ctx once (the module caches
// its canvas reference on first use) and mutate the lookup table per test to
// drive which color → RGBA tuple the "canvas" resolves.
let colorMap: Record<string, [number, number, number, number]> = {};
let currentRgba: [number, number, number, number] = [0, 0, 0, 0];

beforeAll(() => {
  const ctx = {
    clearRect: () => {},
    fillRect: () => {},
    set fillStyle(v: string) {
      const hit = colorMap[v.trim().toLowerCase()];
      currentRgba = hit ?? [0, 0, 0, 0];
    },
    get fillStyle() {
      return '';
    },
    getImageData: () => ({ data: Uint8ClampedArray.from(currentRgba) }),
  } as unknown as CanvasRenderingContext2D;

  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
});

beforeEach(() => {
  colorMap = {};
  currentRgba = [0, 0, 0, 0];
});

describe('toHexColor', () => {
  it('passes through 6-digit hex (lowercased)', () => {
    expect(toHexColor('#AABBCC')).toBe('#aabbcc');
  });

  it('expands 3-digit hex to 6-digit', () => {
    expect(toHexColor('#abc')).toBe('#aabbcc');
  });

  it('trims whitespace around a hex input', () => {
    expect(toHexColor('  #123456  ')).toBe('#123456');
  });

  it('converts rgb() to 6-digit hex via canvas', () => {
    colorMap = { 'rgb(17, 34, 51)': [17, 34, 51, 255] };
    expect(toHexColor('rgb(17, 34, 51)')).toBe('#112233');
  });

  it('converts rgba() to hex and drops alpha', () => {
    colorMap = { 'rgba(17, 34, 51, 0.5)': [17, 34, 51, 128] };
    expect(toHexColor('rgba(17, 34, 51, 0.5)')).toBe('#112233');
  });

  it('converts named colors via canvas', () => {
    colorMap = { tomato: [255, 99, 71, 255] };
    expect(toHexColor('tomato')).toBe('#ff6347');
  });

  it('returns null when the color is fully transparent (canvas alpha 0)', () => {
    colorMap = { 'rgba(0, 0, 0, 0)': [0, 0, 0, 0] };
    expect(toHexColor('rgba(0, 0, 0, 0)')).toBeNull();
  });
});

describe('normalizeThemeConfig', () => {
  it('returns null when value is not an object', () => {
    expect(normalizeThemeConfig(null as unknown as JsonValue)).toBeNull();
    expect(normalizeThemeConfig('#111111' as unknown as JsonValue)).toBeNull();
    expect(normalizeThemeConfig([1, 2, 3] as unknown as JsonValue)).toBeNull();
  });

  it('returns null when background is missing', () => {
    expect(normalizeThemeConfig({ line: { color: '#112233' } })).toBeNull();
  });

  it('returns null when background fails to parse', () => {
    // colorMap is empty → stub returns alpha 0 → toHexColor returns null.
    expect(normalizeThemeConfig({ background: 'not-a-real-color' })).toBeNull();
  });

  it('normalizes a 3-digit hex background to 6-digit', () => {
    const out = normalizeThemeConfig({ background: '#abc' });
    expect(out?.background).toBe('#aabbcc');
  });

  it('preserves non-hex-sensitive fields untouched', () => {
    const out = normalizeThemeConfig({
      background: '#112233',
      grid: { color: 'rgba(50, 50, 50, 0.5)', style: 'dashed' },
      tooltip: { background: 'rgba(0, 0, 0, 0.9)' },
    });
    expect(out?.grid).toEqual({ color: 'rgba(50, 50, 50, 0.5)', style: 'dashed' });
    expect(out?.tooltip).toEqual({ background: 'rgba(0, 0, 0, 0.9)' });
  });

  it('normalizes line.color when present', () => {
    const out = normalizeThemeConfig({
      background: '#112233',
      line: { color: '#abc', width: 2 },
    });
    expect(out?.line?.color).toBe('#aabbcc');
    expect(out?.line?.width).toBe(2);
  });

  it('leaves line.color unchanged when not a string', () => {
    const out = normalizeThemeConfig({
      background: '#112233',
      line: { width: 2 },
    });
    expect(out?.line).toEqual({ width: 2 });
  });
});
