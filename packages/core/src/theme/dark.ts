import type { ChartTheme } from './types';

export const darkTheme: ChartTheme = {
  background: '#131722',
  chartGradient: ['#1a1f2e', '#101318'] as [string, string],

  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 12,
    axisFontSize: 10,
    yFontSize: 11,
    tooltipFontSize: 12,
  },

  grid: {
    color: 'rgba(42, 46, 57, 0.6)',
    style: 'dashed',
  },

  candlestick: {
    upColor: '#26a69a',
    downColor: '#ef5350',
    wickUpColor: '#26a69a',
    wickDownColor: '#ef5350',
  },

  line: {
    color: '#2962FF',
    width: 1,
    areaTopColor: 'rgba(41, 98, 255, 0.08)',
    areaBottomColor: 'rgba(41, 98, 255, 0.01)',
  },

  seriesColors: [
    '#2962FF',
    '#FF6D00',
    '#26a69a',
    '#AB47BC',
    '#ef5350',
    '#FFCA28',
    '#66BB6A',
    '#EC407A',
    '#42A5F5',
    '#B388FF',
  ],

  bands: {
    upper: '#42A5F5',
    lower: '#EC407A',
  },

  crosshair: {
    color: 'rgba(150, 150, 150, 0.5)',
    labelBackground: '#363a45',
    labelTextColor: '#d1d4dc',
  },

  axis: { textColor: '#787b86' },

  yLabel: {
    upBackground: '#26a69a',
    downBackground: '#ef5350',
    neutralBackground: '#363a45',
    textColor: '#ffffff',
  },

  tooltip: {
    background: 'rgba(19, 23, 34, 0.9)',
    textColor: '#d1d4dc',
    borderColor: 'rgba(42, 46, 57, 0.8)',
  },
};
