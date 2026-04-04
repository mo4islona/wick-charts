import { MONO, MONO_URL, createTheme } from '../create';

export const gruvbox = createTheme({
  name: 'Gruvbox',
  description: 'Retro warm with earthy tones',
  background: '#282828',
  grid: { color: 'rgba(60,56,54,0.8)' },
  candlestick: { upColor: '#b8bb26', downColor: '#fb4934' },
  line: { color: '#83a598' },
  seriesColors: [
    '#83a598',
    '#fe8019',
    '#b8bb26',
    '#d3869b',
    '#fb4934',
    '#fabd2f',
    '#8ec07c',
    '#fb4934',
    '#458588',
    '#d3869b',
  ],
  bands: { upper: '#83a598', lower: '#d3869b' },
  crosshair: { color: 'rgba(146,131,116,0.4)', labelBackground: '#3c3836' },
  axis: { textColor: '#928374' },
  tooltip: { background: 'rgba(40,40,40,0.92)', textColor: '#ebdbb2', borderColor: 'rgba(60,56,54,0.6)' },
  typography: { fontFamily: MONO },
  fontUrl: MONO_URL,
});
