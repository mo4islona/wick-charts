<script lang="ts">
import type { HTMLAttributes } from 'svelte/elements';

import { cn } from '../../../shadcn/lib/utils';

let { class: className, children, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div data-slot="card-footer" class={cn('bg-muted/50 rounded-b-xl border-t p-4 group-data-[size=sm]/card:p-3 flex items-center', className)} {...rest}>
  {@render children?.()}
</div>
