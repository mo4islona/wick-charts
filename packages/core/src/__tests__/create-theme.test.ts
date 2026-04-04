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

  it('applies candlestick overrides', () => {
    const preset = createTheme({
      background: '#282a36',
      candlestick: { upColor: '#00ff00', downColor: '#ff0000' },
    });
    expect(preset.theme.candlestick.upColor).toBe('#00ff00');
    expect(preset.theme.candlestick.downColor).toBe('#ff0000');
    // wick colors should default to body colors
    expect(preset.theme.candlestick.wickUpColor).toBe('#00ff00');
    expect(preset.theme.candlestick.wickDownColor).toBe('#ff0000');
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
    // defaults preserved
    expect(preset.theme.typography.axisFontSize).toBe(10);
  });

  it('stores fontUrl', () => {
    const preset = createTheme({
      background: '#000',
      fontUrl: 'https://fonts.example.com/foo.css',
    });
    expect(preset.fontUrl).toBe('https://fonts.example.com/foo.css');
  });
});
