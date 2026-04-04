import type { ChartTheme } from './types';

export const lightTheme: ChartTheme = {
  background: '#ffffff',
  chartGradient: ['#ffffff', '#f5f6f8'] as [string, string],

  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 12,
    axisFontSize: 10,
    yFontSize: 11,
    tooltipFontSize: 12,
  },

  grid: {
    color: 'rgba(0, 0, 0, 0.06)',
    style: 'solid',
  },

  candlestick: {
    upColor: '#089981',
    downColor: '#f23645',
    wickUpColor: '#089981',
    wickDownColor: '#f23645',
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
    '#089981',
    '#AB47BC',
    '#f23645',
    '#E6A700',
    '#43A047',
    '#D81B60',
    '#1E88E5',
    '#7E57C2',
  ],

  bands: { upper: '#1E88E5', lower: '#D81B60' },

  crosshair: {
    color: 'rgba(0, 0, 0, 0.2)',
    labelBackground: '#4c525e',
    labelTextColor: '#ffffff',
  },

  axis: { textColor: '#787b86' },

  yLabel: {
    upBackground: '#089981',
    downBackground: '#f23645',
    neutralBackground: '#4c525e',
    textColor: '#ffffff',
  },

  tooltip: {
    background: 'rgba(255, 255, 255, 0.95)',
    textColor: '#131722',
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
};
