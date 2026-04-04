import { JAKARTA, JAKARTA_URL, createTheme } from '../create';

export const lavenderMist = createTheme({
  name: 'Lavender Mist',
  background: '#f5f0f4',
  candlestick: { upColor: '#6b8e5e', downColor: '#b85468' },
  line: { color: '#7c6bc4' },
  seriesColors: [
    '#7c6bc4',
    '#d4885a',
    '#6b8e5e',
    '#c46b8e',
    '#b85468',
    '#8e7a4e',
    '#4e8e8a',
    '#b85468',
    '#7c6bc4',
    '#c46b8e',
  ],
  bands: { upper: '#4e8e8a', lower: '#b85468' },
  grid: { color: 'rgba(150,130,155,0.12)' },
  axis: { textColor: '#9a88a0' },
  crosshair: { color: 'rgba(150,130,155,0.2)', labelBackground: '#ebe4e8' },
  tooltip: { background: 'rgba(245,240,244,0.95)', textColor: '#3a3050', borderColor: 'rgba(150,130,155,0.25)' },
  typography: { fontFamily: JAKARTA },
  fontUrl: JAKARTA_URL,
  chartGradient: ['#f8f4f7', '#f5f0f4'],
});
