<script lang="ts">
import { NUMBER_MUTED_OPACITY, NUMBER_SCRIPT_STYLE, type NumberRun, numberRuns } from '@wick-charts/core';

/** A formatted number, e.g. the output of `formatSignificant`. */
export let text: string;
/** Mute the characters that only place the value (`0.0₅` in `0.0₅8123`). */
export let mute: boolean = true;

const SCRIPT_PART = { sub: 'zeros', sup: 'exponent' } as const;

$: runs = numberRuns(text, { mute });
$: plain = runs.every((run) => run.kind === 'plain' && !run.muted);

function runStyle(run: NumberRun): string {
  const opacity = run.muted ? `opacity:${NUMBER_MUTED_OPACITY};` : '';
  if (run.kind === 'plain') return opacity;

  const script = NUMBER_SCRIPT_STYLE[run.kind];

  return `${opacity}font-size:${script.fontSize};position:relative;top:${script.top};`;
}
</script>

<!-- One line: whitespace between the runs would render as gaps. -->
{#if plain}{text}{:else}{#each runs as run}<span data-part={run.kind === 'plain' ? undefined : SCRIPT_PART[run.kind]} style={runStyle(run)}>{run.text}</span>{/each}{/if}
