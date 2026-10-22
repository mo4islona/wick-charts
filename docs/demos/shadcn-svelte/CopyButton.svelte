<script lang="ts">
import { onDestroy } from 'svelte';

let { text }: { text: string } = $props();

let copied = $state(false);
let timer: ReturnType<typeof setTimeout> | undefined;

function copy(): void {
  navigator.clipboard?.writeText(text).then(
    () => {
      copied = true;
      clearTimeout(timer);
      timer = setTimeout(() => {
        copied = false;
      }, 1500);
    },
    () => {},
  );
}

onDestroy(() => clearTimeout(timer));
</script>

<button
  type="button"
  title={text}
  class="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
  onclick={copy}
>
  {copied ? 'Copied' : 'Copy install command'}
</button>
