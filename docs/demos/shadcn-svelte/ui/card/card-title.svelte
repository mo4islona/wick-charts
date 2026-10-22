<script lang="ts">
import type { HTMLAttributes } from 'svelte/elements';

import { cn } from '../../../shadcn/lib/utils';

let { class: className, children, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div data-slot="card-title" class={cn('text-base leading-snug font-medium group-data-[size=sm]/card:text-sm cn-font-heading', className)} {...rest}>
  {@render children?.()}
</div>
