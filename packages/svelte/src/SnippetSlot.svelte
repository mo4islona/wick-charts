<script lang="ts">
import { SnippetHost } from './snippet-host.js';

/** A Svelte 5 snippet passed as a prop; anything else renders nothing. */
export let snippet: unknown = undefined;
/** The slot's props, handed to the snippet as its argument. */
export let props: Record<string, unknown> | undefined = undefined;
</script>

<!-- Slot fallback: Svelte 5 reaches it for a snippet passed as a prop, never for a nested `{#snippet}`. -->
{#if typeof snippet === 'function'}
  {#key snippet}
    <svelte:component this={SnippetHost} {snippet} args={props === undefined ? [] : [props]} />
  {/key}
{/if}
