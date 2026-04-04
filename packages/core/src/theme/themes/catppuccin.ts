import { GEIST, GEIST_URL, createTheme } from '../create';

export const catppuccin = createTheme({
  name: 'Catppuccin',
  description: 'Pastel tones on a mocha base',
  background: '#1e1e2e',
  grid: { color: 'rgba(49,50,68,0.8)' },
  candlestick: { upColor: '#a6e3a1', downColor: '#f38ba8' },
  line: { color: '#89b4fa' },
  seriesColors: [
    '#89b4fa',
    '#fab387',
    '#a6e3a1',
    '#cba6f7',
    '#f38ba8',
    '#f9e2af',
    '#94e2d5',
    '#eba0ac',
    '#74c7ec',
    '#cba6f7',
  ],
  bands: { upper: '#74c7ec', lower: '#f38ba8' },
  crosshair: { color: 'rgba(108,112,134,0.4)', labelBackground: '#313244' },
  axis: { textColor: '#6c7086' },
  tooltip: { background: 'rgba(30,30,46,0.92)', textColor: '#cdd6f4', borderColor: 'rgba(49,50,68,0.6)' },
  typography: { fontFamily: GEIST },
  fontUrl: GEIST_URL,
});
