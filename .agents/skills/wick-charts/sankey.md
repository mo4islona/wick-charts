# Sankey

`<SankeySeries>` draws flows between stages as bands whose width follows the volume: an acquisition funnel, a budget or energy breakdown, request routing. It is a spatial series: no axes, no crosshair, no zoom. Options (node colors, node width and gap, link opacity, labels, durations): `SankeySeriesOptions` in the installed types ([how to read them](SKILL.md#props-and-options-read-the-installed-types)).

```tsx
<ChartContainer grid={{ visible: false }}>
  <SankeySeries
    nodes={[{ id: 'ads', label: 'Paid ads' }, { id: 'landing' }, { id: 'signup' }, { id: 'bounced' }]}
    links={[
      { source: 'ads', target: 'landing', value: 2600 },
      { source: 'landing', target: 'signup', value: 900 },
      { source: 'landing', target: 'bounced', value: 1700 },
    ]}
  />
  <SankeyTooltip />
</ChartContainer>
```

```vue
<script setup lang="ts">
import { ChartContainer, type SankeyLink, type SankeyNode, SankeySeries, SankeyTooltip } from '@wick-charts/vue';

defineProps<{ nodes: SankeyNode[]; links: SankeyLink[] }>();
</script>

<template>
  <ChartContainer :grid="{ visible: false }">
    <SankeySeries :nodes="nodes" :links="links" />
    <SankeyTooltip />
  </ChartContainer>
</template>
```

```svelte
<script lang="ts">
  import { ChartContainer, type SankeyLink, type SankeyNode, SankeySeries, SankeyTooltip } from '@wick-charts/svelte';

  let { nodes, links }: { nodes: SankeyNode[]; links: SankeyLink[] } = $props();
</script>

<ChartContainer grid={{ visible: false }}>
  <SankeySeries {nodes} {links} />
  <SankeyTooltip />
</ChartContainer>
```

- **Data:** `nodes: SankeyNode[]` = `{ id, label?, color? }` and `links: SankeyLink[]` = `{ source, target, value, color? }`, where `source` and `target` are node ids. Imperative: `chart.setSeriesData(id, { nodes, links })`. A link to an unknown node, or without a finite `value` above 0, is skipped with a console warning, once per series, in production builds too; links with the same `source` and `target` merge; a node that no link reaches is not drawn.
- **No cycles:** the links must form a DAG. On a cycle (a self-link too) `<SankeySeries>` logs `Sankey links form a cycle: a → b → a` with `console.error` and keeps the previous graph; the next valid graph replaces it. The imperative `chart.setSeriesData` throws that error instead. To show the error in your UI, check a graph that comes from user input before you pass it.
- **Layout:** a node's column is its longest path from a source; a node with no outgoing link goes to the last column. Node height follows its throughput. The layout is deterministic.
- **Colors:** a link takes its own `color`, else the color of its source node.
- **Live updates:** pass new `nodes` / `links`. Nodes ease by `id` and links by `source → target`; new ones fade in and removed ones fade out. A new array of the same graph does nothing.
- **Hover:** a node highlights its links and their end nodes, a link its two nodes; the rest dims. `<SankeyTooltip>` shows the node label and throughput with its share of all source outflow, or `Source → Target` with the link value and its share of the source's outflow. The `onSeriesHover` callback and `chart.getHoverInfo()` report the same.
