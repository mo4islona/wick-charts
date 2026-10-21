import type { FC } from 'react';

import type { ChartTheme } from '@wick-charts/react';

import { GuideRouteContext } from '../../components/GuideNav';
import type { Route } from '../../routes';
import { STEPS as ANNOTATIONS_STEPS, AnnotationsPage } from './annotations';
import { STEPS as CATEGORY_BARS_STEPS, CategoryBarsPage } from './category-bars';
import { STEPS as CUSTOM_INTRO_STEPS, CustomIntroPage } from './custom-intro';
import { STEPS as CUSTOM_RENDERS_STEPS, CustomRendersPage } from './custom-renders';
import { STEPS as DATA_LOADING_STEPS, DataLoadingPage } from './data-loading';
import { STEPS as MULTI_CHART_SYNC_STEPS, MultiChartSyncPage } from './multi-chart-sync';
import { DECLARATIVE_STEPS, IMPERATIVE_STEPS, RealtimeDataPage } from './realtime-data';
import { STEPS as SECONDARY_SCALE_STEPS, SecondaryScalePage } from './secondary-scale';
import { XAxisTypesPage, STEPS as X_AXIS_TYPES_STEPS } from './x-axis-types';

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
  'use-cases/custom-intro': CustomIntroPage,
  'use-cases/annotations': AnnotationsPage,
  'use-cases/data-loading': DataLoadingPage,
  'use-cases/secondary-scale': SecondaryScalePage,
  'use-cases/x-axis-types': XAxisTypesPage,
  'use-cases/category-bars': CategoryBarsPage,
};

/** Walkthrough step headings per guide, for the docs search index. */
export const GUIDE_STEPS: Partial<Record<Route, string[]>> = {
  'use-cases/realtime-data': [...DECLARATIVE_STEPS, ...IMPERATIVE_STEPS].map((step) => step.heading),
  'use-cases/multi-chart-sync': MULTI_CHART_SYNC_STEPS.map((step) => step.heading),
  'use-cases/custom-renders': CUSTOM_RENDERS_STEPS.map((step) => step.heading),
  'use-cases/custom-intro': CUSTOM_INTRO_STEPS.map((step) => step.heading),
  'use-cases/annotations': ANNOTATIONS_STEPS.map((step) => step.heading),
  'use-cases/data-loading': DATA_LOADING_STEPS.map((step) => step.heading),
  'use-cases/secondary-scale': SECONDARY_SCALE_STEPS.map((step) => step.heading),
  'use-cases/x-axis-types': X_AXIS_TYPES_STEPS.map((step) => step.heading),
  'use-cases/category-bars': CATEGORY_BARS_STEPS.map((step) => step.heading),
};

export function UseCasesRoutePage({ route, theme }: { route: Route; theme: ChartTheme }) {
  const Page = USE_CASES[route];

  if (!Page) {
    return <div style={{ padding: 24, color: theme.tooltip.textColor }}>Unknown use-case route: {route}</div>;
  }

  return (
    <GuideRouteContext.Provider value={route}>
      <Page theme={theme} />
    </GuideRouteContext.Provider>
  );
}
