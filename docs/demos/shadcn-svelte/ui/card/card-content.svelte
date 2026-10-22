<script lang="ts">
import type { HTMLAttributes } from 'svelte/elements';

import { cn } from '../../../shadcn/lib/utils';

let { class: className, children, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div data-slot="card-content" class={cn('px-4 group-data-[size=sm]/card:px-3', className)} {...rest}>
  {@render children?.()}
</div>
