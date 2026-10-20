<script lang="ts">
import {
  type NumberFlowFormat,
  type NumberFlowHandle,
  mountNumberFlow,
  resolveNumberFlowFormat,
} from '@wick-charts/core';
import { onDestroy, onMount } from 'svelte';

export let value: number;
/**
 * Value-to-string formatter. Defaults to `formatSignificant`: leading zeros
 * collapse into a count (`0.0₅8123`), large values take a suffix (`1.235B`).
 * `Intl.NumberFormatOptions` is also accepted (legacy) — routed through the
 * built-in `Intl.NumberFormat`.
 */
export let format: NumberFlowFormat | undefined = undefined;
/** BCP 47 locale tag. Gives the decimal separator; a locale other than `'en-US'` without `format` formats with `Intl.NumberFormat`. */
export let locale: string = 'en-US';
/** Per-digit spin duration in ms. A value that arrives sooner than this after the previous one snaps instead. */
export let spinDuration: number = 350;
/** How long a character that left keeps its width before the number shrinks, in ms. */
export let shrinkDelay: number = 0;

// The engine owns the root's children; Svelte only renders the empty root.
let root: HTMLSpanElement;
let flow: NumberFlowHandle | null = null;

$: resolved = resolveNumberFlowFormat(format, locale);
$: text = resolved.format(value);

onMount(() => {
  flow = mountNumberFlow(root, { spinDuration, shrinkDelay, decimal: resolved.decimal });
});

onDestroy(() => {
  flow?.destroy();
  flow = null;
});

$: flow?.setOptions({ spinDuration, shrinkDelay, decimal: resolved.decimal });
$: flow?.update(text, value);
</script>

<span bind:this={root} style="display:inline-flex;font-variant-numeric:tabular-nums;line-height:1.2;white-space:nowrap;"></span>
