import { type BlockEntry, installCommand } from '../../demos/shadcn/catalog';
import { type GuideCopy, HEADINGS, YourData, upgradeStep } from './shadcn-guide';

function usageCode(block: BlockEntry): string {
  return `<script lang="ts">
  import ${block.component} from '#lib/components/${block.name}.svelte';
</script>

<${block.component} />`;
}

const WRAPPER_CODE = `<script lang="ts">
  import { LineSeries, TimeAxis, type TimePoint, Tooltip, YAxis } from '@wick-charts/svelte';

  import { WickChart } from '#lib/components/ui/wick-chart/index.js';

  let { data }: { data: TimePoint[] } = $props();
</script>

<WickChart class="aspect-auto h-[250px]">
  <LineSeries {data} />
  <YAxis />
  <TimeAxis />
  <Tooltip />
</WickChart>`;

/** The shadcn-svelte registry. */
export const SVELTE_COPY: GuideCopy = {
  lead: (demoLink) => <p style={{ margin: 0 }}>Chart blocks for shadcn-svelte. {demoLink}</p>,
  steps: (block) => [
    {
      heading: HEADINGS.add,
      body: (
        <>
          On a fresh SvelteKit 3 app, <code>add</code> can fail with "File '$app/tsconfig' not found": run{' '}
          <code>npx svelte-kit sync</code> and add again.
        </>
      ),
      code: installCommand(block.name, 'svelte'),
    },
    {
      heading: HEADINGS.use,
      body: (
        <>
          <YourData block={block} file={`${block.name}.svelte`} /> The snippets import through <code>#lib</code>, the
          alias of SvelteKit 3; on SvelteKit 2, use <code>$lib</code>.
        </>
      ),
      code: usageCode(block),
    },
    {
      heading: HEADINGS.own,
      body: (
        <>
          Add the chart container of the blocks: <code>{installCommand('wick-chart', 'svelte')}</code>. It takes the
          colors and dark mode of your shadcn-svelte theme. Set the size with classes, the default is{' '}
          <code>aspect-video</code>.
        </>
      ),
      code: WRAPPER_CODE,
    },
    upgradeStep('svelte'),
  ],
};
