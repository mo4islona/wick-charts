<script lang="ts">
import type { HTMLAttributes } from 'svelte/elements';

import { cn } from '../../../shadcn/lib/utils';

let { class: className, children, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div data-slot="card-description" class={cn('text-muted-foreground text-sm', className)} {...rest}>
  {@render children?.()}
</div>
