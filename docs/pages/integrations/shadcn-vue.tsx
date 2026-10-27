import { type BlockEntry, installCommand } from '../../demos/shadcn/catalog';
import { type GuideCopy, HEADINGS, YourData } from './shadcn-guide';

function usageCode(block: BlockEntry): string {
  return `<script setup lang="ts">
import ${block.component} from '@/components/${block.component}.vue';
</script>

<template>
  <${block.component} />
</template>`;
}

const WRAPPER_CODE = `<script setup lang="ts">
import { LineSeries, TimeAxis, type TimePoint, Tooltip, YAxis } from '@wick-charts/vue';

import { WickChart } from '@/components/ui/wick-chart';

defineProps<{ data: TimePoint[] }>();
</script>

<template>
  <WickChart class="aspect-auto h-[250px]">
    <LineSeries :data="data" />
    <YAxis />
    <TimeAxis />
    <Tooltip />
  </WickChart>
</template>`;

/** The shadcn-vue registry for Vue and Nuxt. */
export const VUE_COPY: GuideCopy = {
  lead: (demoLink) => <p style={{ margin: 0 }}>Chart blocks for shadcn-vue and Nuxt. {demoLink}</p>,
  steps: (block) => [
    {
      heading: HEADINGS.add,
      code: installCommand(block.name, 'vue'),
    },
    {
      heading: HEADINGS.use,
      body: <YourData block={block} file={`${block.component}.vue`} />,
      code: usageCode(block),
    },
    {
      heading: HEADINGS.own,
      body: (
        <>
          Add the chart container of the blocks: <code>{installCommand('wick-chart', 'vue')}</code>. It takes the colors
          and dark mode of your shadcn-vue theme. Set the size with classes, the default is <code>aspect-video</code>.
        </>
      ),
      code: WRAPPER_CODE,
    },
  ],
};
