<!--
  @deprecated Use <InfoBar> instead. Thin wrapper kept for one minor so
  pre-rename callers keep rendering. Forwards every prop AND the default slot
  only when the caller actually passes one — otherwise InfoBar renders its
  built-in UI.
-->
<script lang="ts">
import type { SnapshotSort, TooltipFormatter } from '@wick-charts/core';

import InfoBar from './InfoBar.svelte';

export let sort: SnapshotSort = 'none';
export let format: TooltipFormatter | undefined = undefined;
</script>

{#if $$slots.default}
  {#if format}
    <InfoBar {sort} {format} let:snapshots let:time let:isHover>
      <slot {snapshots} {time} {isHover} />
    </InfoBar>
  {:else}
    <InfoBar {sort} let:snapshots let:time let:isHover>
      <slot {snapshots} {time} {isHover} />
    </InfoBar>
  {/if}
{:else if format}
  <InfoBar {sort} {format} />
{:else}
  <InfoBar {sort} />
{/if}
