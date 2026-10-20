import { type ParseNumberOptions, parseNumberParts } from './number-parts';

/** `sub` is a collapsed zero count, `sup` a power. */
export type NumberRunKind = 'plain' | 'sub' | 'sup';

/** Adjacent characters of a formatted number that share one style. */
export interface NumberRun {
  readonly text: string;
  readonly kind: NumberRunKind;
  readonly muted: boolean;
}

export interface NumberRunOptions extends ParseNumberOptions {
  /** Mute the characters that only place the value. Default `true`. */
  mute?: boolean;
}

/** Opacity over `currentColor` of the characters that only place the value, so it reads in any theme. */
export const NUMBER_MUTED_OPACITY = 0.5;

/**
 * Script digits render as plain digits at a smaller size: Unicode subscript
 * glyphs come from a fallback font in most themes and take a full cell in
 * monospace ones. `top` shifts them without growing the line box.
 */
export const NUMBER_SCRIPT_STYLE: Readonly<Record<'sub' | 'sup', { fontSize: string; top: string }>> = {
  sub: { fontSize: '0.68em', top: '0.3em' },
  sup: { fontSize: '0.68em', top: '-0.45em' },
};

const SCRIPT_CHARS = /[₀-₉⁰¹²³⁴-⁹⁻]/;

/** `true` when `text` holds a subscript or superscript character. */
export function hasScriptDigits(text: string): boolean {
  return SCRIPT_CHARS.test(text);
}

/** Splits a formatted number into runs of one style: plain, a zero count, a power; muted or not. */
export function numberRuns(text: string, opts: NumberRunOptions = {}): NumberRun[] {
  const mute = opts.mute ?? true;
  const runs: NumberRun[] = [];

  for (const part of parseNumberParts(text, opts)) {
    let kind: NumberRunKind = 'plain';
    if (part.type === 'zeros') kind = 'sub';
    if (part.type === 'exponent') kind = 'sup';

    const muted = mute && part.muted;
    const last = runs[runs.length - 1];
    if (last !== undefined && last.kind === kind && last.muted === muted) {
      runs[runs.length - 1] = { ...last, text: last.text + part.char };
      continue;
    }

    runs.push({ text: part.char, kind, muted });
  }

  return runs;
}

/**
 * Writes a formatted number into `el`: plain text when nothing needs styling,
 * else one `<span>` per styled run. Reads back the same as `textContent`
 * except that script digits come out as plain digits.
 */
export function renderNumberText(el: HTMLElement, text: string, opts: NumberRunOptions = {}): void {
  if (opts.mute === false && !hasScriptDigits(text)) {
    el.textContent = text;

    return;
  }

  const runs = numberRuns(text, opts);
  const plain = runs.every((run) => run.kind === 'plain' && !run.muted);
  if (plain) {
    el.textContent = text;

    return;
  }

  const nodes = runs.map((run) => {
    if (run.kind === 'plain' && !run.muted) return document.createTextNode(run.text);

    const span = document.createElement('span');
    span.textContent = run.text;
    if (run.muted) span.style.opacity = String(NUMBER_MUTED_OPACITY);
    if (run.kind !== 'plain') {
      const script = NUMBER_SCRIPT_STYLE[run.kind];
      span.style.fontSize = script.fontSize;
      span.style.position = 'relative';
      span.style.top = script.top;
      span.dataset.part = run.kind === 'sub' ? 'zeros' : 'exponent';
    }

    return span;
  });

  el.replaceChildren(...nodes);
}
