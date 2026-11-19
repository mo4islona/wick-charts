// Renders the server-render docs page images from the page's own spec, with
// the published render build. Run `pnpm --filter @wick-charts/render build` first.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { dracula, githubLight, renderChart } from '../packages/render/dist/index.js';

const ROOT = new URL('..', import.meta.url).pathname;
const SPEC = join(ROOT, 'docs/pages/integrations/server-render-spec.json');
const OUT = join(ROOT, 'docs/public/render');

/** One image for dark docs themes, one for light: the page picks by the docs background. */
const VARIANTS = [
  { file: 'report-dark.png', theme: dracula },
  { file: 'report-light.png', theme: githubLight },
];

const spec = JSON.parse(await readFile(SPEC, 'utf8'));

for (const { file, theme } of VARIANTS) {
  const { data } = await renderChart({ ...spec, theme }, { format: 'png', pixelRatio: 2 });
  await writeFile(join(OUT, file), data);
  console.log(`Wrote docs/public/render/${file} (${Math.round(data.length / 1024)} kB)`);
}
