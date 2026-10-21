import type { ChartTheme } from '@wick-charts/react';

import { Markdown } from '../../components/Markdown';
import source from './shadcn.md?raw';

/** Section headings, for the docs search index. */
export const SHADCN_HEADINGS: string[] = [...source.matchAll(/^## (.+)$/gm)].map((match) => match[1]);

export function ShadcnPage({ theme }: { theme: ChartTheme }) {
  return (
    <div style={{ padding: '12px 20px 40px' }}>
      <Markdown source={source} theme={theme} />
    </div>
  );
}
