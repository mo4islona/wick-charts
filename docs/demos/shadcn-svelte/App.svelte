<script lang="ts">
import { onMount } from 'svelte';

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
import BlockView from './BlockView.svelte';
import Segmented from './Segmented.svelte';

const GUIDE_PATH = FLAVORS.svelte.guidePath;

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

const darkQuery = window.matchMedia(DARK_QUERY);

let block = $state.raw<BlockEntry | null>(findBlock(params.get('block')));
let palette = $state<PaletteName>(initialPalette());
let modeSetting = $state<ModeSetting>(initialMode());
let systemDark = $state(darkQuery.matches);

const mode = $derived<Mode>(modeSetting === 'system' ? (systemDark ? 'dark' : 'light') : modeSetting);

$effect(() => applyLook(mode, palette));

function onSchemeChange(): void {
  systemDark = darkQuery.matches;
}

// The docs guide drives an embedded demo by message, so a change does not reload the frame.
function onMessage(event: MessageEvent): void {
  if (event.origin !== window.location.origin || !isDemoMessage(event.data)) return;

  block = findBlock(event.data.block);
  modeSetting = event.data.mode;
  palette = event.data.palette;
}

onMount(() => {
  darkQuery.addEventListener('change', onSchemeChange);
  if (embedded) window.addEventListener('message', onMessage);

  return () => {
    darkQuery.removeEventListener('change', onSchemeChange);
    window.removeEventListener('message', onMessage);
  };
});

function changeBlock(next: BlockEntry | null): void {
  block = next;
  replaceQuery({ block: next?.name ?? null });
}

function changePalette(next: PaletteName): void {
  palette = next;
  replaceQuery({ palette: next === 'neutral' ? null : next });
}

function changeMode(next: ModeSetting): void {
  modeSetting = next;
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

{#if embedded}
  <main class="flex min-h-svh flex-col justify-center p-4">
    {#if block}
      <BlockView entry={block} bare />
    {:else}
      <div class="gap-x-4 md:columns-2">
        {#each BLOCKS as entry (entry.name)}
          <BlockView {entry} />
        {/each}
      </div>
    {/if}
  </main>
{:else}
  <div class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:px-6">
    <header class="flex flex-col gap-4 border-b pb-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <h1 class="text-xl font-semibold tracking-tight">Wick Charts blocks for shadcn-svelte</h1>
        <a
          href={GUIDE_PATH}
          class="rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Install guide →
        </a>
      </div>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Segmented label="Mode" value={modeSetting} options={MODE_OPTIONS} onchange={changeMode} />
        <Segmented label="Chart colors" value={palette} options={PALETTE_OPTIONS} onchange={changePalette} />
      </div>
      <nav aria-label="Blocks" class="flex flex-wrap gap-1">
        <button
          type="button"
          aria-current={block === null ? 'page' : undefined}
          class={navClass(block === null)}
          onclick={() => changeBlock(null)}
        >
          All blocks
        </button>
        {#each BLOCKS as entry (entry.name)}
          <button
            type="button"
            aria-current={block?.name === entry.name ? 'page' : undefined}
            class={navClass(block?.name === entry.name)}
            onclick={() => changeBlock(entry)}
          >
            {entry.title}
          </button>
        {/each}
      </nav>
    </header>

    {#if block}
      <BlockView entry={block} />
    {:else}
      <div class="gap-x-4 md:columns-2">
        {#each BLOCKS as entry (entry.name)}
          <BlockView {entry} />
        {/each}
      </div>
    {/if}
  </div>
{/if}
