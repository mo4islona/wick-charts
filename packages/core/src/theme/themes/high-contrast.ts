import { autoGradient, createTheme } from '../create';

const SILKSCREEN = "'Silkscreen', cursive";
const SILKSCREEN_URL = 'https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&display=swap';

export const highContrast = createTheme({
  name: 'Matrix',
  background: '#000000',
  candlestick: {
    up: { body: autoGradient('#00ff41'), wick: '#00ff41' },
    down: { body: autoGradient('#00802a'), wick: '#00802a' },
  },
  line: { color: '#00ff41' },
  seriesColors: [
    '#00ff41',
    '#00cc33',
    '#00992a',
    '#33ff66',
    '#66ff88',
    '#00e639',
    '#00b830',
    '#4dff78',
    '#00ff41',
    '#00cc33',
  ],
  bands: { upper: '#33ff66', lower: '#00802a' },
  grid: { color: 'rgba(0,255,65,0.06)' },
  axis: { textColor: '#00cc33' },
  crosshair: { color: 'rgba(0,255,65,0.3)', labelBackground: '#0a1a0a' },
  tooltip: { background: 'rgba(0,10,0,0.95)', textColor: '#00ff41', borderColor: 'rgba(0,255,65,0.2)' },
  typography: { fontFamily: SILKSCREEN },
  fontUrl: SILKSCREEN_URL,
  chartGradient: ['#010a01', '#000000'],
});
