// A Node project with no `dom` lib must compile against the published types.
import { writeFile } from 'node:fs/promises';

import { type ChartSpec, createTheme, githubLight, renderChart } from '@wick-charts/render';

const spec: ChartSpec = {
  theme: githubLight,
  series: [{ type: 'line', data: [{ time: Date.now(), value: 1 }] }],
  padding: { right: { intervals: 2 } },
};

const { data } = await renderChart({ ...spec, theme: createTheme({ background: '#fff' }) }, { format: 'png' });
await writeFile('chart.png', data);
