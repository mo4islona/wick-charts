import type { SvelteComponent } from 'svelte';

interface SnippetHostProps {
  snippet: (target: unknown, ...args: unknown[]) => unknown;
  args: unknown[];
}

/**
 * Renders a Svelte 5 snippet passed as a prop: a legacy `<slot>` renders only
 * nested `{#snippet}` blocks. Svelte 5 calls a component with the DOM anchor on
 * the client and the SSR renderer on the server, and a snippet takes the same
 * first argument; its other arguments are getters on the client, values on the server.
 */
function renderSnippet(target: unknown, props: SnippetHostProps): void {
  const onClient = typeof Node !== 'undefined' && target instanceof Node;
  const args = onClient ? props.args.map((_, i) => () => props.args[i]) : props.args;

  props.snippet(target, ...args);
}

/** Typed as a component so a Svelte 4 template takes it in `<svelte:component>`; only Svelte 5 ever mounts it. */
export const SnippetHost = renderSnippet as unknown as typeof SvelteComponent;
