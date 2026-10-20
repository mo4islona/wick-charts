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

/** Keeps the accessible copy of a number in reading order without painting it or taking space. */
export const NUMBER_HIDDEN_STYLE = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
} as const;

const SCRIPT_CHARS = /[₀-₉⁰¹²³⁴-⁹⁻]/;
/** A `0` and its subscript count: `0₅` stands for five zeros. */
const ZERO_COUNT = /0([₀-₉]+)/g;
const SUBSCRIPT_ZERO = 0x2080;
/** No double has more zeros after the point; a longer count is not one `formatSignificant` wrote. */
const MAX_ZERO_COUNT = 400;

/** `true` when `text` holds a subscript or superscript character. */
export function hasScriptDigits(text: string): boolean {
  return SCRIPT_CHARS.test(text);
}

/**
 * A formatted number as a screen reader should get it: the zero count spelled
 * out (`0.0₅81` → `0.0000081`). A power keeps its superscript characters.
 */
export function accessibleNumberText(text: string): string {
  return text.replace(ZERO_COUNT, (match: string, count: string) => {
    const zeros = subscriptValue(count);
    if (zeros > MAX_ZERO_COUNT) return match;

    return '0'.repeat(zeros);
  });
}

function subscriptValue(digits: string): number {
  let value = 0;
  for (const char of digits) {
    value = value * 10 + (char.charCodeAt(0) - SUBSCRIPT_ZERO);
  }

  return value;
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
 * else one `<span>` per styled run. With script digits, the runs are hidden
 * from screen readers, which read {@link accessibleNumberText} instead.
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

  if (!hasScriptDigits(text)) {
    el.replaceChildren(...nodes);

    return;
  }

  // Script digits show as plain digits, so a reader gets a hidden copy: `0.0₅81` is not `0.0581`.
  const hidden = document.createElement('span');
  Object.assign(hidden.style, NUMBER_HIDDEN_STYLE);
  hidden.textContent = accessibleNumberText(text);

  const visual = document.createElement('span');
  visual.setAttribute('aria-hidden', 'true');
  visual.append(...nodes);

  el.replaceChildren(hidden, visual);
}
