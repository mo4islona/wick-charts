<script lang="ts">
import type { Component } from 'svelte';

import { type BlockEntry, installCommand } from '../shadcn/catalog';
import CopyButton from './CopyButton.svelte';

// Each block is one component file, named after the block.
const BLOCK_COMPONENTS = import.meta.glob<Component>('../../../registry/shadcn-svelte/blocks/chart-*.svelte', {
  eager: true,
  import: 'default',
});

let { entry, bare = false }: { entry: BlockEntry; bare?: boolean } = $props();

const Block = $derived(BLOCK_COMPONENTS[`../../../registry/shadcn-svelte/blocks/${entry.name}.svelte`]);
</script>

{#if Block}
  {#if bare}
    <Block />
  {:else}
    <section class="mb-8 flex min-w-0 break-inside-avoid flex-col gap-2">
      <div class="flex items-center justify-between gap-2">
        <code class="font-mono text-xs text-muted-foreground">{entry.name}</code>
        <CopyButton text={installCommand(entry.name, 'svelte')} />
      </div>
      <Block />
    </section>
  {/if}
{/if}
