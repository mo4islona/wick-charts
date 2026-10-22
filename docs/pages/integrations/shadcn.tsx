import type { ChartTheme } from '@wick-charts/react';

import type { Flavor } from '../../demos/shadcn/catalog';
import { type Route, viewFramework } from '../../routes';
import { type GuideCopy, HEADINGS, ShadcnGuide } from './shadcn-guide';
import { REACT_COPY } from './shadcn-react';
import { SVELTE_COPY } from './shadcn-svelte';
import { VUE_COPY } from './shadcn-vue';

/** Step headings, for the docs search index. */
export const SHADCN_STEPS: string[] = Object.values(HEADINGS);

const COPY: Record<Flavor, GuideCopy> = { react: REACT_COPY, vue: VUE_COPY, svelte: SVELTE_COPY };

/**
 * One page for every registry. The Vue and Svelte views have URLs of their own, so search engines index each
 * copy apart; the docs framework selector moves between them.
 */
export function ShadcnPage({ route, theme }: { route: Route; theme: ChartTheme }) {
  const flavor = viewFramework(route) ?? 'react';

  return <ShadcnGuide theme={theme} flavor={flavor} copy={COPY[flavor]} />;
}
