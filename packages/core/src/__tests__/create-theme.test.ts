import { describe, expect, it } from 'vitest';

import { createTheme } from '../theme/create';

describe('createTheme', () => {
  it('creates a dark theme from background', () => {
    const theme = createTheme({ background: '#1a1b26' });
    expect(theme.dark).toBe(true);
    expect(theme.background).toBe('#1a1b26');
    expect(theme.name).toBe('Custom');
  });

  it('creates a light theme from background', () => {
    const theme = createTheme({ background: '#fafbfc' });
    expect(theme.dark).toBe(false);
  });

  it('uses custom name', () => {
    const theme = createTheme({ name: 'My Theme', background: '#000' });
    expect(theme.name).toBe('My Theme');
  });

  it('applies candlestick overrides', () => {
    const theme = createTheme({
      background: '#282a36',
      candlestick: { upColor: '#00ff00', downColor: '#ff0000' },
    });
    expect(theme.candlestick.upColor).toBe('#00ff00');
    expect(theme.candlestick.downColor).toBe('#ff0000');
    expect(theme.candlestick.wickUpColor).toBe('#00ff00');
    expect(theme.candlestick.wickDownColor).toBe('#ff0000');
  });

  it('applies line color override', () => {
    const theme = createTheme({
      background: '#282a36',
      line: { color: '#ff00ff' },
    });
    expect(theme.line.color).toBe('#ff00ff');
    expect(theme.line.areaTopColor).toContain('255, 0, 255');
  });

  it('uses custom chartGradient when provided', () => {
    const theme = createTheme({
      background: '#fff',
      chartGradient: ['#aaa', '#bbb'],
    });
    expect(theme.chartGradient).toEqual(['#aaa', '#bbb']);
  });

  it('auto-generates chartGradient for dark themes', () => {
    const theme = createTheme({ background: '#282a36' });
    const [top, bottom] = theme.chartGradient;
    expect(top).not.toBe('#282a36');
    expect(bottom).not.toBe('#282a36');
  });

  it('passes through seriesColors', () => {
    const colors = ['#a', '#b', '#c'];
    const theme = createTheme({ background: '#000', seriesColors: colors });
    expect(theme.seriesColors).toEqual(colors);
  });

  it('applies partial tooltip override', () => {
    const theme = createTheme({
      background: '#000',
      tooltip: { textColor: '#ff0' },
    });
    expect(theme.tooltip.textColor).toBe('#ff0');
    expect(theme.tooltip.background).toBeTruthy();
  });

  it('applies typography override', () => {
    const theme = createTheme({
      background: '#000',
      typography: { fontFamily: 'Comic Sans', fontSize: 16 },
    });
    expect(theme.typography.fontFamily).toBe('Comic Sans');
    expect(theme.typography.fontSize).toBe(16);
    expect(theme.typography.axisFontSize).toBe(10);
  });

  it('stores fontUrl', () => {
    const theme = createTheme({
      background: '#000',
      fontUrl: 'https://fonts.example.com/foo.css',
    });
    expect(theme.fontUrl).toBe('https://fonts.example.com/foo.css');
  });

  it('carries description through', () => {
    const theme = createTheme({
      background: '#000',
      description: 'Test description',
    });
    expect(theme.description).toBe('Test description');
  });
});
