<script lang="ts">
import { getThemeContext, getTitleAnchor } from '../context.js';
import SnippetSlot from '../SnippetSlot.svelte';
import { portal } from './portal.js';

/** Svelte 5: the default slot's snippet passed as a prop (`children={snippet}`) rather than nested. */
export let children: unknown = undefined;

/**
 * Secondary label in a muted color. Pass markup through the `sub` slot —
 * `<span slot="sub">` on Svelte 4, `{#snippet sub()}` or `sub={snippet}` on Svelte 5 — to mirror
 * React's `sub: ReactNode`; the slot wins when both are provided. A plain
 * string still works but is deprecated, kept for callers upgrading from 0.3.1.
 *
 * Note: the title strip is rendered with `pointer-events: none` so it
 * doesn't intercept canvas hover events. Interactive children (`<a>`,
 * `<button>`) need to opt back in with `pointer-events: auto`.
 */
export let sub: string | undefined = undefined;

const themeStore = getThemeContext();
const anchorStore = getTitleAnchor();

$: theme = $themeStore;
$: anchor = $anchorStore;
</script>

{#if anchor}
  <div
    use:portal={anchor}
    data-chart-title=""
    style="
      display:flex;
      align-items:baseline;
      gap:6px;
      padding:6px 8px 0;
      flex-shrink:0;
      font-family:{theme.typography.fontFamily};
      font-size:{theme.typography.fontSize}px;
      font-weight:600;
      color:{theme.tooltip.textColor};
      pointer-events:none;
    "
  >
    <span><slot><SnippetSlot snippet={children} /></slot></span>
    {#if $$slots.sub || typeof sub === 'function'}
      <span
        style="
          font-weight:400;
          color:{theme.axis.textColor};
          font-size:{theme.axis.fontSize}px;
        "
      ><slot name="sub"><SnippetSlot snippet={sub} /></slot></span>
    {:else if typeof sub === 'string' && sub}
      <span
        style="
          font-weight:400;
          color:{theme.axis.textColor};
          font-size:{theme.axis.fontSize}px;
        "
      >{sub}</span>
    {/if}
  </div>
{/if}
