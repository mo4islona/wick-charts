// Maps API-section routes to component manifest keys, then renders ApiPage
// with the hand-written intro from intros.ts. Chart series get a "↗ See
// demos" cross-link to the corresponding Charts entry — same content, two
// entry points (mirrors MUI's Components vs Components-API duality).

import type { ChartTheme } from '@wick-charts/react';

import { ApiPage } from '../../components/ApiPage';
import { Markdown } from '../../components/Markdown';
import { CHART_API_TO_DEMO, type Route } from '../../routes';
import { INTROS } from './intros';

const ROUTE_TO_COMPONENT: Record<string, string> = {
  // chart series — duplicated into the API list as flat references
  'api/line-series': 'LineSeries',
  'api/bar-series': 'BarSeries',
  'api/candlestick-series': 'CandlestickSeries',
  'api/pie-series': 'PieSeries',
  'api/sparkline': 'Sparkline',
  // container & overlays
  'api/chart-container': 'ChartContainer',
  'api/x-axis': 'TimeAxis',
  'api/y-axis': 'YAxis',
  'api/tooltip': 'Tooltip',
  'api/crosshair': 'Crosshair',
  'api/legend': 'Legend',
  'api/navigator': 'Navigator',
  'api/title': 'Title',
  'api/info-bar': 'InfoBar',
  'api/pie-legend': 'PieLegend',
  'api/pie-tooltip': 'PieTooltip',
  'api/number-flow': 'NumberFlow',
  'api/y-label': 'YLabel',
};

export function ApiRoutePage({ route, theme }: { route: Route; theme: ChartTheme }) {
  const component = ROUTE_TO_COMPONENT[route];
  if (!component) {
    return <div style={{ padding: 24, color: theme.tooltip.textColor }}>Unknown API route: {route}</div>;
  }

  const intro = INTROS[component];
  const demoRoute = CHART_API_TO_DEMO[route];

  return (
    <ApiPage component={component} theme={theme} fallbackDescription={intro} demoRoute={demoRoute}>
      {intro && <Markdown source={intro} theme={theme} />}
    </ApiPage>
  );
}

export { ROUTE_TO_COMPONENT };
