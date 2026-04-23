import { describe, expect, it } from 'vitest';

import { createTheme } from '../theme/create';

describe('createTheme', () => {
  it('creates a dark theme from background', () => {
    const preset = createTheme({ background: '#1a1b26' });
    expect(preset.dark).toBe(true);
    expect(preset.theme.background).toBe('#1a1b26');
    expect(preset.name).toBe('Custom');
  });

  it('creates a light theme from background', () => {
    const preset = createTheme({ background: '#fafbfc' });
    expect(preset.dark).toBe(false);
  });

  it('uses custom name', () => {
    const preset = createTheme({ name: 'My Theme', background: '#000' });
    expect(preset.name).toBe('My Theme');
  });

  it('applies candlestick body overrides', () => {
    const preset = createTheme({
      background: '#282a36',
      candlestick: { up: { body: '#00ff00' }, down: { body: '#ff0000' } },
    });
    expect(preset.theme.candlestick.up.body).toBe('#00ff00');
    expect(preset.theme.candlestick.down.body).toBe('#ff0000');
    // wick colors should default to body colors
    expect(preset.theme.candlestick.up.wick).toBe('#00ff00');
    expect(preset.theme.candlestick.down.wick).toBe('#ff0000');
  });

  it('preserves candlestick body tuple for explicit gradient', () => {
    const preset = createTheme({
      background: '#282a36',
      candlestick: { up: { body: ['#aaff00', '#008800'] }, down: { body: '#ff0000' } },
    });
    expect(preset.theme.candlestick.up.body).toEqual(['#aaff00', '#008800']);
    // wick is a single color, so it falls back to the top stop of the tuple.
    expect(preset.theme.candlestick.up.wick).toBe('#aaff00');
  });

  it('uses autoGradient source (not the lightened top stop) for scalar fallbacks', async () => {
    // Regression: yLabel / bands / wick default / volume tint should use the
    // canonical color a preset author passes to autoGradient, not the top
    // stop that happens to live in body[0].
    const { autoGradient } = await import('../theme/create');
    const preset = createTheme({
      background: '#131722',
      candlestick: { up: { body: autoGradient('#26a69a') }, down: { body: autoGradient('#ef5350') } },
    });
    // wick default = canonical, not body[0] (#59d9cd-ish).
    expect(preset.theme.candlestick.up.wick).toBe('#26a69a');
    expect(preset.theme.candlestick.down.wick).toBe('#ef5350');
    // yLabel backgrounds default to the canonical too.
    expect(preset.theme.yLabel.upBackground).toBe('#26a69a');
    expect(preset.theme.yLabel.downBackground).toBe('#ef5350');
    // bands.lower defaults to the canonical down color.
    expect(preset.theme.bands.lower).toBe('#ef5350');
  });

  it('applies line color override', () => {
    const preset = createTheme({
      background: '#282a36',
      line: { color: '#ff00ff' },
    });
    expect(preset.theme.line.color).toBe('#ff00ff');
    // area colors should derive from line color
    expect(preset.theme.line.areaTopColor).toContain('255, 0, 255');
  });

  it('uses custom chartGradient when provided', () => {
    const preset = createTheme({
      background: '#fff',
      chartGradient: ['#aaa', '#bbb'],
    });
    expect(preset.theme.chartGradient).toEqual(['#aaa', '#bbb']);
  });

  it('auto-generates chartGradient for dark themes', () => {
    const preset = createTheme({ background: '#282a36' });
    const [top, bottom] = preset.theme.chartGradient;
    // top should be lighter, bottom should be darker
    expect(top).not.toBe('#282a36');
    expect(bottom).not.toBe('#282a36');
  });

  it('passes through seriesColors', () => {
    const colors = ['#a', '#b', '#c'];
    const preset = createTheme({ background: '#000', seriesColors: colors });
    expect(preset.theme.seriesColors).toEqual(colors);
  });

  it('applies partial tooltip override', () => {
    const preset = createTheme({
      background: '#000',
      tooltip: { textColor: '#ff0' },
    });
    expect(preset.theme.tooltip.textColor).toBe('#ff0');
    // background should still be auto-derived
    expect(preset.theme.tooltip.background).toBeTruthy();
  });

  it('applies typography override', () => {
    const preset = createTheme({
      background: '#000',
      typography: { fontFamily: 'Comic Sans', fontSize: 16 },
    });
    expect(preset.theme.typography.fontFamily).toBe('Comic Sans');
    expect(preset.theme.typography.fontSize).toBe(16);
    // axis font size default preserved
    expect(preset.theme.axis.fontSize).toBe(10);
  });

  it('axis per-direction override wins over shared defaults (y)', () => {
    const preset = createTheme({
      background: '#000',
      axis: { fontSize: 9, textColor: '#111', y: { fontSize: 14, textColor: '#ccc' } },
    });
    expect(preset.theme.axis.fontSize).toBe(9);
    expect(preset.theme.axis.textColor).toBe('#111');
    expect(preset.theme.axis.y?.fontSize).toBe(14);
    expect(preset.theme.axis.y?.textColor).toBe('#ccc');
    expect(preset.theme.axis.x).toBeUndefined();
  });

  it('axis per-direction override wins over shared defaults (x)', () => {
    const preset = createTheme({
      background: '#000',
      axis: { x: { fontSize: 8 } },
    });
    expect(preset.theme.axis.x?.fontSize).toBe(8);
    expect(preset.theme.axis.x?.textColor).toBeUndefined();
    expect(preset.theme.axis.y).toBeUndefined();
  });

  it('shallow-copies axis.{x,y} so later caller mutations do not leak into the theme', () => {
    const xOverride = { fontSize: 8 };
    const preset = createTheme({ background: '#000', axis: { x: xOverride } });
    xOverride.fontSize = 99;
    expect(preset.theme.axis.x?.fontSize).toBe(8);
  });

  it('moves font sizes to their owning sections', () => {
    const preset = createTheme({
      background: '#000',
      axis: { fontSize: 11 },
      tooltip: { fontSize: 13 },
      yLabel: { fontSize: 15 },
    });
    expect(preset.theme.axis.fontSize).toBe(11);
    expect(preset.theme.tooltip.fontSize).toBe(13);
    expect(preset.theme.yLabel.fontSize).toBe(15);
  });

  it('stores fontUrl', () => {
    const preset = createTheme({
      background: '#000',
      fontUrl: 'https://fonts.example.com/foo.css',
    });
    expect(preset.fontUrl).toBe('https://fonts.example.com/foo.css');
  });
});
