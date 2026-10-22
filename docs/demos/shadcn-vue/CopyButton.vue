<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';

const props = defineProps<{ text: string }>();

const copied = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

function copy(): void {
  navigator.clipboard?.writeText(props.text).then(
    () => {
      copied.value = true;
      clearTimeout(timer);
      timer = setTimeout(() => {
        copied.value = false;
      }, 1500);
    },
    () => {},
  );
}

onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <button
    type="button"
    :title="text"
    class="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
    @click="copy"
  >
    {{ copied ? 'Copied' : 'Copy install command' }}
  </button>
</template>
