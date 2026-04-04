import { FIRA, FIRA_URL, createTheme } from '../create';

export const dracula = createTheme({
  name: 'Dracula',
  description: 'Classic dark with vibrant highlights',
  background: '#282a36',
  grid: { color: 'rgba(68,71,90,0.8)' },
  candlestick: { upColor: '#45c868', downColor: '#d04848' },
  line: { color: '#a080d8' },
  seriesColors: [
    '#a080d8',
    '#d49858',
    '#45c868',
    '#d068a0',
    '#d04848',
    '#c8d070',
    '#70c0d8',
    '#d04848',
    '#6272a4',
    '#d068a0',
  ],
  bands: { upper: '#70c0d8', lower: '#d068a0' },
  crosshair: { color: 'rgba(98,114,164,0.4)', labelBackground: '#44475a' },
  axis: { textColor: '#6272a4' },
  tooltip: { background: 'rgba(40,42,54,0.92)', textColor: '#f8f8f2', borderColor: 'rgba(68,71,90,0.6)' },
  typography: { fontFamily: FIRA },
  fontUrl: FIRA_URL,
});
