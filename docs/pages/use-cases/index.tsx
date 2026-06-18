import type { FC } from 'react';

import type { ChartTheme } from '@wick-charts/react';

import type { Route } from '../../routes';
import { AnnotationsPage } from './annotations';
import { CustomRendersPage } from './custom-renders';
import { MultiChartSyncPage } from './multi-chart-sync';
import { RealtimeDataPage } from './realtime-data';

// TODO(use-cases): realtime-data and multi-chart-sync are wired up. Sibling
// page files (load-on-scroll.tsx, custom-overlay.tsx) live on disk and stay
// intentionally unregistered — they need polish before going live. To revive:
// import the page component and add a `'use-cases/<slug>': Page` entry below,
// then add the matching literal to the `Route` union in `docs/routes.ts` and
// the sidebar list in `getSections`.
const USE_CASES: Record<string, FC<{ theme: ChartTheme }>> = {
  'use-cases/realtime-data': RealtimeDataPage,
  'use-cases/multi-chart-sync': MultiChartSyncPage,
  'use-cases/custom-renders': CustomRendersPage,
  'use-cases/annotations': AnnotationsPage,
};

export function UseCasesRoutePage({ route, theme }: { route: Route; theme: ChartTheme }) {
  const Page = USE_CASES[route];

  if (!Page) {
    return <div style={{ padding: 24, color: theme.tooltip.textColor }}>Unknown use-case route: {route}</div>;
  }

  return <Page theme={theme} />;
}
