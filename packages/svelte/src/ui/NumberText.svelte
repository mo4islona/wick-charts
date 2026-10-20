<script lang="ts">
import {
  NUMBER_HIDDEN_STYLE,
  NUMBER_MUTED_OPACITY,
  NUMBER_SCRIPT_STYLE,
  type NumberRun,
  accessibleNumberText,
  hasScriptDigits,
  numberRuns,
} from '@wick-charts/core';

/** A formatted number, e.g. the output of `formatSignificant`. */
export let text: string;
/** Mute the characters that only place the value (`0.0₅` in `0.0₅8123`). */
export let mute: boolean = true;

const SCRIPT_PART = { sub: 'zeros', sup: 'exponent' } as const;

const HIDDEN_CSS = Object.entries(NUMBER_HIDDEN_STYLE)
  .map(([name, value]) => `${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${value};`)
  .join('');

$: runs = numberRuns(text, { mute });
$: plain = runs.every((run) => run.kind === 'plain' && !run.muted);
// Script digits show as plain digits, so a reader gets a hidden copy: `0.0₅81` is not `0.0581`.
$: script = hasScriptDigits(text);

function runStyle(run: NumberRun): string {
  const opacity = run.muted ? `opacity:${NUMBER_MUTED_OPACITY};` : '';
  if (run.kind === 'plain') return opacity;

  const scriptStyle = NUMBER_SCRIPT_STYLE[run.kind];

  return `${opacity}font-size:${scriptStyle.fontSize};position:relative;top:${scriptStyle.top};`;
}
</script>

<!-- One line: whitespace between the runs would render as gaps. -->
{#if plain}{text}{:else}{#if script}<span style={HIDDEN_CSS}>{accessibleNumberText(text)}</span>{/if}<span aria-hidden={script ? 'true' : undefined}>{#each runs as run}<span data-part={run.kind === 'plain' ? undefined : SCRIPT_PART[run.kind]} style={runStyle(run)}>{run.text}</span>{/each}</span>{/if}
