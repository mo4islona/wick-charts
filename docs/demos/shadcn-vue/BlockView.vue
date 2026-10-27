<script setup lang="ts">
import { type Component, computed } from 'vue';

import { type BlockEntry, installCommand } from '../shadcn/catalog';
import CopyButton from './CopyButton.vue';

// Each block is one SFC, named after the block's component.
const BLOCK_COMPONENTS = import.meta.glob<Component>('../../../registry/shadcn-vue/components/Chart*.vue', {
  eager: true,
  import: 'default',
});

const props = defineProps<{ entry: BlockEntry; bare?: boolean }>();

const block = computed(() => BLOCK_COMPONENTS[`../../../registry/shadcn-vue/components/${props.entry.component}.vue`]);
</script>

<template>
  <template v-if="block">
    <component :is="block" v-if="bare" />
    <section v-else class="mb-8 flex min-w-0 break-inside-avoid flex-col gap-2">
      <div class="flex items-center justify-between gap-2">
        <code class="font-mono text-xs text-muted-foreground">{{ entry.name }}</code>
        <CopyButton :text="installCommand(entry.name, 'vue')" />
      </div>
      <component :is="block" />
    </section>
  </template>
</template>
