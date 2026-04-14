import { CAVEAT, CAVEAT_URL } from '../create';
import type { ChartTheme } from '../types';

export const handwritten: ChartTheme = {
  name: 'Handwritten',
  description: 'Sketch-style with a personal touch',
  fontUrl: CAVEAT_URL,
  dark: false,
  background: '#fdf5e6',
  chartGradient: ['#fef6e3', '#fdf5e6'],
  typography: {
    fontFamily: CAVEAT,
    fontSize: 18,
    axisFontSize: 13,
    yFontSize: 15,
    tooltipFontSize: 14,
  },
  grid: {
    color: 'rgba(180,170,150,0.3)',
    style: 'dashed',
  },
  candlestick: {
    upColor: '#7a9a5e',
    downColor: '#b07060',
    wickUpColor: '#7a9a5e',
    wickDownColor: '#b07060',
  },
  line: {
    color: '#6a8fa0',
    width: 1,
    areaTopColor: 'rgba(106,143,160,0.08)',
    areaBottomColor: 'rgba(106,143,160,0.01)',
  },
  seriesColors: [
    '#6a8fa0',
    '#c09050',
    '#7a9a5e',
    '#8a7098',
    '#b07060',
    '#a09030',
    '#508878',
    '#a06878',
    '#6888a0',
    '#8870a0',
  ],
  bands: {
    upper: '#6888a0',
    lower: '#a06878',
  },
  crosshair: {
    color: 'rgba(160,152,128,0.3)',
    labelBackground: '#f5edd8',
    labelTextColor: '#5c5040',
  },
  axis: { textColor: '#a09880' },
  yLabel: {
    upBackground: '#7a9a5e',
    downBackground: '#b07060',
    neutralBackground: '#e8dcc8',
    textColor: '#fdf5e6',
  },
  tooltip: {
    background: 'rgba(253,245,230,0.95)',
    textColor: '#5c5040',
    borderColor: 'rgba(180,170,150,0.4)',
  },
};
