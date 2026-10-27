<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watchEffect } from 'vue';

import {
  BLOCKS,
  type BlockEntry,
  FLAVORS,
  type Mode,
  type PaletteName,
  isDemoMessage,
  isPaletteName,
} from '../shadcn/catalog';
import { cn } from '../shadcn/lib/utils';
import {
  DARK_QUERY,
  MODE_OPTIONS,
  type ModeSetting,
  PALETTE_OPTIONS,
  applyLook,
  findBlock,
  isModeSetting,
  readStoredMode,
  replaceQuery,
  storeMode,
} from '../shadcn/look';
import BlockView from './BlockView.vue';
import Segmented from './Segmented.vue';

const GUIDE_PATH = FLAVORS.vue.guidePath;

const params = new URLSearchParams(window.location.search);
const embedded = params.has('embed');

function initialPalette(): PaletteName {
  const requested = params.get('palette');

  return isPaletteName(requested) ? requested : 'neutral';
}

function initialMode(): ModeSetting {
  const requested = params.get('theme');
  if (isModeSetting(requested)) return requested;

  return (!embedded && readStoredMode()) || 'system';
}

const block = shallowRef<BlockEntry | null>(findBlock(params.get('block')));
const palette = ref<PaletteName>(initialPalette());
const modeSetting = ref<ModeSetting>(initialMode());

const darkQuery = window.matchMedia(DARK_QUERY);
const systemDark = ref(darkQuery.matches);
const mode = computed<Mode>(() => {
  if (modeSetting.value !== 'system') return modeSetting.value;

  return systemDark.value ? 'dark' : 'light';
});

watchEffect(() => applyLook(mode.value, palette.value));

function onSchemeChange(): void {
  systemDark.value = darkQuery.matches;
}

// The docs guide drives an embedded demo by message, so a change does not reload the frame.
function onMessage(event: MessageEvent): void {
  if (event.origin !== window.location.origin || !isDemoMessage(event.data)) return;

  block.value = findBlock(event.data.block);
  modeSetting.value = event.data.mode;
  palette.value = event.data.palette;
}

onMounted(() => {
  darkQuery.addEventListener('change', onSchemeChange);
  if (embedded) window.addEventListener('message', onMessage);
});

onBeforeUnmount(() => {
  darkQuery.removeEventListener('change', onSchemeChange);
  window.removeEventListener('message', onMessage);
});

function changeBlock(next: BlockEntry | null): void {
  block.value = next;
  replaceQuery({ block: next?.name ?? null });
}

function changePalette(next: PaletteName): void {
  palette.value = next;
  replaceQuery({ palette: next === 'neutral' ? null : next });
}

function changeMode(next: ModeSetting): void {
  modeSetting.value = next;
  storeMode(next);
  replaceQuery({ theme: null });
}

function navClass(active: boolean): string {
  return cn(
    'rounded-md px-2.5 py-1 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
    active && 'bg-secondary text-secondary-foreground',
  );
}
</script>

<template>
  <main v-if="embedded" class="flex min-h-svh flex-col justify-center p-4">
    <BlockView v-if="block" :entry="block" bare />
    <div v-else class="gap-x-4 md:columns-2">
      <BlockView v-for="entry in BLOCKS" :key="entry.name" :entry="entry" />
    </div>
  </main>

  <div v-else class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:px-6">
    <header class="flex flex-col gap-4 border-b pb-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <h1 class="text-xl font-semibold tracking-tight">Wick Charts blocks for shadcn-vue</h1>
        <a
          :href="GUIDE_PATH"
          class="rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Install guide →
        </a>
      </div>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Segmented label="Mode" :value="modeSetting" :options="MODE_OPTIONS" @change="changeMode" />
        <Segmented label="Chart colors" :value="palette" :options="PALETTE_OPTIONS" @change="changePalette" />
      </div>
      <nav aria-label="Blocks" class="flex flex-wrap gap-1">
        <button
          type="button"
          :aria-current="block === null ? 'page' : undefined"
          :class="navClass(block === null)"
          @click="changeBlock(null)"
        >
          All blocks
        </button>
        <button
          v-for="entry in BLOCKS"
          :key="entry.name"
          type="button"
          :aria-current="block?.name === entry.name ? 'page' : undefined"
          :class="navClass(block?.name === entry.name)"
          @click="changeBlock(entry)"
        >
          {{ entry.title }}
        </button>
      </nav>
    </header>

    <BlockView v-if="block" :key="block.name" :entry="block" />
    <div v-else class="gap-x-4 md:columns-2">
      <BlockView v-for="entry in BLOCKS" :key="entry.name" :entry="entry" />
    </div>
  </div>
</template>
