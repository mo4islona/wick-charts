<script lang="ts">
import type { HTMLAttributes } from 'svelte/elements';

import { cn } from '../../../shadcn/lib/utils';

let { class: className, children, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div data-slot="card-action" class={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)} {...rest}>
  {@render children?.()}
</div>
