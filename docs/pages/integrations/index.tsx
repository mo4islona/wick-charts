import type { FC } from 'react';

import type { ChartTheme } from '@wick-charts/react';

import type { Route } from '../../routes';
import { SHADCN_STEPS, ShadcnPage } from './shadcn';

const INTEGRATIONS: Partial<Record<Route, FC<{ theme: ChartTheme }>>> = {
  'integrations/shadcn': ShadcnPage,
};

/** Walkthrough step headings per integration, for the docs search index. */
export const INTEGRATION_STEPS: Partial<Record<Route, string[]>> = {
  'integrations/shadcn': SHADCN_STEPS,
};

export function IntegrationsRoutePage({ route, theme }: { route: Route; theme: ChartTheme }) {
  const Page = INTEGRATIONS[route];

  if (!Page) {
    return <div style={{ padding: 24, color: theme.tooltip.textColor }}>Unknown integration route: {route}</div>;
  }

  return <Page theme={theme} />;
}
