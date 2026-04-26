// Wraps each chart playground with a Demos | API tab strip — same shape as
// MUI's react-autocomplete vs api/autocomplete pages, but unified into one URL.

import type { FC } from 'react';

import type { ChartTheme } from '@wick-charts/react';

import { ApiPage } from '../../components/ApiPage';
import { Markdown } from '../../components/Markdown';
import { PageTabs } from '../../components/PageTabs';
import type { Route } from '../../routes';
import { INTROS } from '../api/intros';
import { BarPage } from '../BarPage';
import { CandlestickPage } from '../CandlestickPage';
import { LinePage } from '../LinePage';
import { PiePage } from '../PiePage';
import { SparklinePage } from '../SparklinePage';

interface ChartEntry {
  /** Manifest key for the API tab (e.g. "LineSeries"). */
  component: string;
  Demos: FC<{ theme: ChartTheme }>;
}

const CHARTS: Record<string, ChartEntry> = {
  'charts/candlestick': { component: 'CandlestickSeries', Demos: CandlestickPage },
  'charts/line': { component: 'LineSeries', Demos: LinePage },
  'charts/bar': { component: 'BarSeries', Demos: BarPage },
  'charts/pie': { component: 'PieSeries', Demos: PiePage },
  'charts/sparkline': { component: 'Sparkline', Demos: SparklinePage },
};

export function ChartRoutePage({ route, theme }: { route: Route; theme: ChartTheme }) {
  const entry = CHARTS[route];

  if (!entry) {
    return <div style={{ padding: 24, color: theme.tooltip.textColor }}>Unknown chart route: {route}</div>;
  }

  const intro = INTROS[entry.component];
  const { Demos } = entry;

  return (
    <PageTabs storageKey={`tab:${route}`} theme={theme}>
      {(tab) => {
        if (tab === 'demos') return <Demos theme={theme} />;

        return (
          <ApiPage component={entry.component} theme={theme} fallbackDescription={intro}>
            {intro && <Markdown source={intro} theme={theme} />}
          </ApiPage>
        );
      }}
    </PageTabs>
  );
}
