<script lang="ts" generics="T extends string">
import { cn } from '../shadcn/lib/utils';

let {
  label,
  value,
  options,
  onchange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onchange: (next: T) => void;
} = $props();
</script>

<fieldset class="inline-flex rounded-lg bg-muted p-0.5">
  <legend class="sr-only">{label}</legend>
  {#each options as option (option.value)}
    <button
      type="button"
      aria-pressed={option.value === value}
      class={cn(
        'rounded-md px-2.5 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
        option.value === value && 'bg-background text-foreground shadow-sm',
      )}
      onclick={() => onchange(option.value)}
    >
      {option.label}
    </button>
  {/each}
</fieldset>
