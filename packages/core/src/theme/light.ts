import { autoGradient } from './create';
import type { ChartTheme } from './types';

export const lightTheme: ChartTheme = {
  background: '#ffffff',
  chartGradient: ['#ffffff', '#f5f6f8'] as [string, string],

  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 12,
  },

  grid: {
    color: 'rgba(0, 0, 0, 0.06)',
    style: 'solid',
  },

  candlestick: {
    up: { body: autoGradient('#089981'), wick: '#089981' },
    down: { body: autoGradient('#f23645'), wick: '#f23645' },
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

  axis: {
    fontSize: 10,
    textColor: '#787b86',
  },

  yLabel: {
    fontSize: 11,
    upBackground: '#089981',
    downBackground: '#f23645',
    neutralBackground: '#4c525e',
    textColor: '#ffffff',
  },

  tooltip: {
    fontSize: 12,
    background: 'rgba(255, 255, 255, 0.95)',
    textColor: '#131722',
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
};
