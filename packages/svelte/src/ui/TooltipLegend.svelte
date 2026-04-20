<!--
  @deprecated Use <InfoBar> instead. Thin wrapper kept for one minor so
  pre-rename callers keep rendering. Forwards every prop to InfoBar.
-->
<script lang="ts">
import type { TooltipFormatter } from '@wick-charts/core';

import InfoBar from './InfoBar.svelte';

export let seriesId: string | undefined = undefined;
export let sort: 'none' | 'asc' | 'desc' = 'none';
export let format: TooltipFormatter | undefined = undefined;
</script>

<InfoBar {seriesId} {sort} {format} />
