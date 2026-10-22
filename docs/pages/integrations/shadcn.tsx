import type { ChartTheme } from '@wick-charts/react';

import { type Route, viewFramework } from '../../routes';
import { HEADINGS, ShadcnGuide } from './shadcn-guide';
import { REACT_COPY } from './shadcn-react';
import { VUE_COPY } from './shadcn-vue';

/** Step headings, for the docs search index. */
export const SHADCN_STEPS: string[] = Object.values(HEADINGS);

/**
 * One page for both registries. Its Vue view has a URL of its own, so search engines index the React and the
 * Vue copy apart; the docs framework selector moves between them.
 */
export function ShadcnPage({ route, theme }: { route: Route; theme: ChartTheme }) {
  const flavor = viewFramework(route) === 'vue' ? 'vue' : 'react';
  const copy = flavor === 'vue' ? VUE_COPY : REACT_COPY;

  return <ShadcnGuide theme={theme} flavor={flavor} copy={copy} />;
}
