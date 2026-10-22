import type { FC } from 'react';

import type { ChartTheme } from '@wick-charts/react';

import type { Route } from '../../routes';
import { NUXT_STEPS, NuxtPage } from './nuxt';
import { SHADCN_STEPS, ShadcnPage } from './shadcn';

interface IntegrationPageProps {
  route: Route;
  theme: ChartTheme;
}

const INTEGRATIONS: Partial<Record<Route, FC<IntegrationPageProps>>> = {
  // One component for both views, so a framework pick keeps the picked block.
  'integrations/shadcn': ShadcnPage,
  'integrations/shadcn/vue': ShadcnPage,
  'integrations/nuxt': NuxtPage,
};

/** Walkthrough step headings per integration, for the docs search index. */
export const INTEGRATION_STEPS: Partial<Record<Route, string[]>> = {
  'integrations/shadcn': SHADCN_STEPS,
  'integrations/nuxt': NUXT_STEPS.map((step) => step.heading),
};

export function IntegrationsRoutePage({ route, theme }: IntegrationPageProps) {
  const Page = INTEGRATIONS[route];

  if (!Page) {
    return <div style={{ padding: 24, color: theme.tooltip.textColor }}>Unknown integration route: {route}</div>;
  }

  return <Page route={route} theme={theme} />;
}
