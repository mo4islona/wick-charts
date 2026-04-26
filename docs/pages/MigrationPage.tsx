import type { ChartTheme } from '@wick-charts/react';

import migrationSource from '../../MIGRATION.md?raw';
import { Markdown } from '../components/Markdown';

export function MigrationPage({ theme }: { theme: ChartTheme }) {
  return (
    <div style={{ padding: '12px 20px 40px' }}>
      <Markdown source={migrationSource} theme={theme} />
    </div>
  );
}
