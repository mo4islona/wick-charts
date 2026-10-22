<script setup lang="ts" generic="T extends string">
import { cn } from '../shadcn/lib/utils';

defineProps<{
  label: string;
  value: T;
  options: { value: T; label: string }[];
}>();

const emit = defineEmits<{ change: [next: T] }>();
</script>

<template>
  <fieldset class="inline-flex rounded-lg bg-muted p-0.5">
    <legend class="sr-only">{{ label }}</legend>
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :aria-pressed="option.value === value"
      :class="
        cn(
          'rounded-md px-2.5 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
          option.value === value && 'bg-background text-foreground shadow-sm',
        )
      "
      @click="emit('change', option.value)"
    >
      {{ option.label }}
    </button>
  </fieldset>
</template>
