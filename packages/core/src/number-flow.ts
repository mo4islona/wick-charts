/**
 * DOM engine behind `<NumberFlow>` in every framework: the framework renders the
 * root, the engine owns its children. Slots are keyed by place inside one
 * notation and by significant position when the zero count, suffix or power changes.
 */

import { prefersReducedMotion } from './animation/reduced-motion';
import { formatSignificant } from './utils/format';
import { type NumberPart, parseNumberParts } from './utils/number-parts';
import { NUMBER_MUTED_OPACITY, NUMBER_SCRIPT_STYLE } from './utils/number-text';

export interface NumberFlowOptions {
  /**
   * Spin, glide and width transition in ms. A text that arrives sooner than
   * this after the previous one snaps: a spin retargeted mid-turn shows two
   * half digits. Default `350`.
   */
  readonly spinDuration?: number;
  /**
   * How long a character that left keeps its width before the number
   * shrinks, in ms. A value that moves back and forth across `99.99` /
   * `100.01` then holds its width. Default `0`.
   */
  readonly shrinkDelay?: number;
  /** Decimal separator of the formatted text. Default `'.'`. */
  readonly decimal?: string;
}

export interface NumberFlowHandle {
  /** Show `text`, the formatted `value`. The change in `|value|` sets the spin direction. */
  update(text: string, value: number): void;
  setOptions(opts: NumberFlowOptions): void;
  /** Stop the timers and remove the slots. */
  destroy(): void;
}

/** The `format` prop of `<NumberFlow>`: a formatter, or legacy `Intl.NumberFormat` options. */
export type NumberFlowFormat = ((value: number) => string) | Intl.NumberFormatOptions;

const DEFAULT_LOCALE = 'en-US';
const decimalByLocale = new Map<string, string>();

function decimalSeparator(locale: string): string {
  const cached = decimalByLocale.get(locale);
  if (cached !== undefined) return cached;

  const part = new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === 'decimal');
  const decimal = part?.value ?? '.';
  decimalByLocale.set(locale, decimal);

  return decimal;
}

/**
 * Resolves `<NumberFlow>`'s `format` and `locale`: a function wins, Intl
 * options or a locale other than `'en-US'` go through `Intl.NumberFormat`,
 * and the default is {@link formatSignificant}. `decimal` is the locale's
 * decimal separator, which tells the parser where the fraction starts.
 */
export function resolveNumberFlowFormat(
  format: NumberFlowFormat | undefined,
  locale: string = DEFAULT_LOCALE,
): { format: (value: number) => string; decimal: string } {
  // An inline formatter re-resolves on every render, so the separator is cached per locale.
  const decimal = decimalSeparator(locale);

  if (typeof format === 'function') return { format, decimal };
  if (format === undefined && locale === DEFAULT_LOCALE) return { format: formatSignificant, decimal };

  const nf = new Intl.NumberFormat(locale, format);

  return { format: (v) => nf.format(v), decimal };
}

/** Line height of a slot in `em`; a digit column moves in steps of one cell. */
const CELL_EM = 1.2;
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
const MUTE_TRANSITION = 'opacity 300ms ease';
/** Spin edges fade out instead of cutting the half-visible digits. */
const SPIN_MASK = 'linear-gradient(to bottom, transparent, #000 12%, #000 88%, transparent)';
/** Enter / exit slide distance in `em`. */
const SLIDE_EM = 0.5;

interface Slot {
  part: NumberPart;
  /** Width track (`grid-template-columns: 0fr ↔ 1fr`), muted opacity, glide transform. */
  readonly el: HTMLSpanElement;
  /** Clips the digit column; fades and slides on enter and exit. */
  readonly clip: HTMLSpanElement;
  /** 20 stacked cells `0–9, 0–9` for a digit, `null` for any other character. */
  readonly column: HTMLSpanElement | null;
  /** Cell of `column` in view. */
  position: number;
  leaving: { hold: ReturnType<typeof setTimeout> | null; remove: ReturnType<typeof setTimeout> | null } | null;
}

interface Motion {
  readonly duration: number;
  /** `1` when `|value|` grew, `-1` when it fell, `0` when unchanged. */
  readonly trend: number;
}

function isDigitPart(part: NumberPart): boolean {
  return part.digit !== null;
}

/** The parts that set the scale of the number; a change re-keys the slots by significant position. */
function notationOf(parts: readonly NumberPart[]): string {
  return parts
    .filter((p) => p.type === 'zeros' || p.type === 'suffix' || p.type === 'exponent')
    .map((p) => `${p.type}:${p.char}`)
    .join('|');
}

function matchKey(part: NumberPart, bySignificance: boolean): string {
  if (bySignificance && part.sig !== null) return `s${part.sig}`;

  return part.key;
}

/** A spin direction per slot: the zero count falls while the value grows. */
function spinDirection(part: NumberPart, trend: number): number {
  return part.type === 'zeros' ? -trend : trend;
}

function translateY(em: number): string {
  // 9 × 1.2 is 10.799999999999999 in floating point.
  return `translateY(${Number(em.toFixed(4))}em)`;
}

/** Inserts `nodes` into `root` in order, moving only those out of place: a moved node drops its running transitions. */
function placeInOrder(root: HTMLElement, nodes: readonly HTMLElement[]): void {
  let cursor = root.firstChild;
  for (const node of nodes) {
    if (node === cursor) {
      cursor = cursor.nextSibling;
      continue;
    }

    root.insertBefore(node, cursor);
  }
}

export function mountNumberFlow(root: HTMLElement, options: NumberFlowOptions = {}): NumberFlowHandle {
  let spinDuration = options.spinDuration ?? 350;
  let shrinkDelay = options.shrinkDelay ?? 0;
  let decimal = options.decimal ?? '.';

  let slots: Slot[] = [];
  let text: string | null = null;
  let value = 0;
  let parts: NumberPart[] = [];
  let changedAt = Number.NEGATIVE_INFINITY;

  root.setAttribute('role', 'img');

  function createSlot(part: NumberPart): Slot {
    const el = document.createElement('span');
    el.style.display = 'grid';
    el.style.gridTemplateColumns = '1fr';
    el.style.transition = MUTE_TRANSITION;

    const clip = document.createElement('span');
    clip.style.minWidth = '0';
    clip.style.overflow = 'hidden';
    clip.style.height = `${CELL_EM}em`;
    el.append(clip);

    // Flex alignment, not `top`: the clip holds the digit column, so the whole slot moves.
    if (part.type === 'zeros' || part.type === 'exponent') {
      const sub = part.type === 'zeros';
      el.style.fontSize = NUMBER_SCRIPT_STYLE[sub ? 'sub' : 'sup'].fontSize;
      el.style.alignSelf = sub ? 'flex-end' : 'flex-start';
    }

    let column: HTMLSpanElement | null = null;
    if (isDigitPart(part)) {
      clip.style.maskImage = SPIN_MASK;
      clip.style.setProperty('-webkit-mask-image', SPIN_MASK);

      column = document.createElement('span');
      column.style.display = 'flex';
      column.style.flexDirection = 'column';
      for (let i = 0; i < 20; i++) {
        const cell = document.createElement('span');
        cell.textContent = String(i % 10);
        cell.style.display = 'block';
        cell.style.height = `${CELL_EM}em`;
        cell.style.lineHeight = `${CELL_EM}em`;
        cell.style.textAlign = 'center';
        column.append(cell);
      }
      clip.append(column);
    } else {
      clip.style.display = 'block';
      clip.style.lineHeight = `${CELL_EM}em`;
      clip.style.whiteSpace = 'pre';
    }

    const slot: Slot = { part, el, clip, column, position: 0, leaving: null };
    setPart(slot, part);
    show(slot, part);

    return slot;
  }

  /** The part a slot stands for: its mute and data attributes, not what it shows. */
  function setPart(slot: Slot, part: NumberPart): void {
    slot.part = part;
    slot.el.dataset.part = part.type;
    if (part.muted) {
      slot.el.dataset.muted = '';
    } else {
      delete slot.el.dataset.muted;
    }
    slot.el.style.opacity = part.muted ? String(NUMBER_MUTED_OPACITY) : '1';
  }

  /** Shows the character of `part` without motion. */
  function show(slot: Slot, part: NumberPart): void {
    if (slot.column === null) {
      slot.clip.textContent = part.char;

      return;
    }

    const digit = part.digit ?? 0;
    slot.position = digit;
    slot.column.style.transition = 'none';
    slot.column.style.transform = translateY(-digit * CELL_EM);
  }

  /** Jumps the running spin, roll, glide and width transitions of a slot to their end; the mute fade stays. */
  function settle(slot: Slot): void {
    slot.el.style.transition = MUTE_TRANSITION;
    slot.clip.style.transition = 'none';
    if (slot.column !== null) slot.column.style.transition = 'none';
  }

  /** Moves a digit column to `digit` along the trend, `9 → 0` one step up. Returns the play step. */
  function spin(slot: Slot, digit: number, motion: Motion): (() => void) | null {
    const column = slot.column;
    if (column === null) return null;

    const current = slot.position % 10;
    if (current === digit) return null;

    if (motion.duration === 0) {
      slot.position = digit;
      column.style.transition = 'none';
      column.style.transform = translateY(-digit * CELL_EM);

      return null;
    }

    const direction = spinDirection(slot.part, motion.trend);
    let steps = digit - current;
    if (direction > 0) steps = (digit - current + 10) % 10;
    if (direction < 0) steps = -((current - digit + 10) % 10);

    // Two stacked copies: a spin up starts in the first, a spin down in the second, so it never runs off the column.
    const start = steps < 0 ? current + 10 : current;
    const end = start + steps;
    slot.position = end;
    column.style.transition = 'none';
    column.style.transform = translateY(-start * CELL_EM);

    return () => {
      column.style.transition = `transform ${motion.duration}ms ${EASE}`;
      column.style.transform = translateY(-end * CELL_EM);
    };
  }

  /** A non-digit character that changed rolls in from the trend side: `M → B`. */
  function roll(slot: Slot, char: string, motion: Motion): (() => void) | null {
    slot.clip.textContent = char;
    if (motion.duration === 0) return null;

    const clip = slot.clip;
    clip.style.transition = 'none';
    clip.style.opacity = '0';
    clip.style.transform = translateY(motion.trend >= 0 ? SLIDE_EM : -SLIDE_EM);

    return () => {
      clip.style.transition = `opacity ${motion.duration}ms ease, transform ${motion.duration}ms ${EASE}`;
      clip.style.opacity = '1';
      clip.style.transform = '';
    };
  }

  /** Reduced motion: a changed character fades in instead of spinning. */
  function crossfade(slot: Slot): () => void {
    const clip = slot.clip;
    clip.style.transition = 'none';
    clip.style.opacity = '0';

    return () => {
      clip.style.transition = `opacity ${spinDuration}ms ease`;
      clip.style.opacity = '1';
    };
  }

  function enter(slot: Slot, motion: Motion): (() => void) | null {
    if (motion.duration === 0) return null;

    const { el, clip } = slot;
    el.style.transition = 'none';
    el.style.gridTemplateColumns = '0fr';
    clip.style.transition = 'none';
    clip.style.opacity = '0';
    clip.style.transform = translateY(motion.trend >= 0 ? SLIDE_EM : -SLIDE_EM);

    return () => {
      el.style.transition = `grid-template-columns ${motion.duration}ms ${EASE}, ${MUTE_TRANSITION}`;
      el.style.gridTemplateColumns = '1fr';
      clip.style.transition = `opacity ${motion.duration}ms ease, transform ${motion.duration}ms ${EASE}`;
      clip.style.opacity = '1';
      clip.style.transform = '';
    };
  }

  function revive(slot: Slot, motion: Motion): () => void {
    clearLeaving(slot);

    const { el, clip } = slot;

    return () => {
      el.style.transition = `grid-template-columns ${motion.duration}ms ${EASE}, ${MUTE_TRANSITION}`;
      el.style.gridTemplateColumns = '1fr';
      clip.style.transition = `opacity ${motion.duration}ms ease, transform ${motion.duration}ms ${EASE}`;
      clip.style.opacity = '1';
      clip.style.transform = '';
    };
  }

  function clearLeaving(slot: Slot): void {
    if (slot.leaving === null) return;

    if (slot.leaving.hold !== null) clearTimeout(slot.leaving.hold);
    if (slot.leaving.remove !== null) clearTimeout(slot.leaving.remove);
    slot.leaving = null;
  }

  function drop(slot: Slot): void {
    clearLeaving(slot);
    slot.el.remove();
    slots = slots.filter((s) => s !== slot);
  }

  /** Fades the character out at once; the width holds for `shrinkDelay`, then collapses. */
  function leave(slot: Slot, motion: Motion): (() => void) | null {
    const leaving: NonNullable<Slot['leaving']> = { hold: null, remove: null };
    slot.leaving = leaving;

    const collapse = () => {
      leaving.hold = null;
      slot.el.style.transition = `grid-template-columns ${motion.duration}ms ${EASE}, ${MUTE_TRANSITION}`;
      slot.el.style.gridTemplateColumns = '0fr';
      leaving.remove = setTimeout(() => drop(slot), motion.duration);
    };

    if (motion.duration === 0) {
      slot.clip.style.transition = 'none';
      slot.clip.style.opacity = '0';
      leaving.hold = setTimeout(collapse, shrinkDelay);

      return null;
    }

    const clip = slot.clip;

    return () => {
      clip.style.transition = `opacity ${motion.duration}ms ease, transform ${motion.duration}ms ${EASE}`;
      clip.style.opacity = '0';
      clip.style.transform = translateY(motion.trend >= 0 ? -SLIDE_EM : SLIDE_EM);
      leaving.hold = setTimeout(collapse, shrinkDelay);
    };
  }

  /** Pairs every new part with a slot: reused by place or significance, revived if leaving, else new. */
  function match(next: readonly NumberPart[], bySignificance: boolean): { kept: Slot[]; fresh: Set<Slot> } {
    const byKey = new Map<string, Slot>();
    const present = slots.filter((s) => s.leaving === null);
    const leaving = slots.filter((s) => s.leaving !== null);
    for (const slot of [...present, ...leaving]) {
      const key = matchKey(slot.part, bySignificance);
      if (!byKey.has(key)) byKey.set(key, slot);
    }

    const fresh = new Set<Slot>();
    const kept = next.map((part) => {
      const key = matchKey(part, bySignificance);
      const slot = byKey.get(key);
      const sameKind = slot !== undefined && isDigitPart(slot.part) === isDigitPart(part);
      if (slot !== undefined && sameKind) {
        byKey.delete(key);

        return slot;
      }

      const created = createSlot(part);
      fresh.add(created);

      return created;
    });

    return { kept, fresh };
  }

  /** New slots in text order; a leaving slot stays next to its old neighbours. */
  function orderSlots(kept: readonly Slot[], leaving: ReadonlySet<Slot>): Slot[] {
    const ordered: Slot[] = [];
    let cursor = 0;
    for (const slot of kept) {
      const oldIndex = slots.indexOf(slot);
      if (oldIndex >= cursor) {
        for (let i = cursor; i < oldIndex; i++) {
          if (leaving.has(slots[i])) ordered.push(slots[i]);
        }
        cursor = oldIndex + 1;
      }
      ordered.push(slot);
    }

    for (let i = cursor; i < slots.length; i++) {
      if (leaving.has(slots[i])) ordered.push(slots[i]);
    }

    return ordered;
  }

  function update(nextText: string, nextValue: number): void {
    if (nextText === text) return;

    const now = performance.now();
    const first = text === null;
    const reduced = prefersReducedMotion();
    const tooFast = now - changedAt < spinDuration;
    const animate = !first && !tooFast && spinDuration > 0;
    const motion: Motion = {
      duration: animate && !reduced ? spinDuration : 0,
      trend: first ? 0 : Math.sign(Math.abs(nextValue) - Math.abs(value)),
    };

    // A snap also lands the last update's motion, so an unchanged digit does not spin on beside snapped ones.
    if (motion.duration === 0) {
      for (const slot of slots) {
        settle(slot);
      }
    }

    const nextParts = parseNumberParts(nextText, { decimal });
    const bySignificance = !first && notationOf(nextParts) !== notationOf(parts);
    const glide = bySignificance && motion.duration > 0;

    const before = new Map<Slot, number>();
    if (glide) {
      for (const slot of slots) {
        if (slot.leaving === null) before.set(slot, slot.el.getBoundingClientRect().left);
      }
    }

    const { kept, fresh } = match(nextParts, bySignificance);
    const keptSet = new Set(kept);
    const leavingNow = new Set(slots.filter((s) => !keptSet.has(s) && s.leaving === null));
    const stillLeaving = new Set(slots.filter((s) => !keptSet.has(s)));

    const play: Array<() => void> = [];
    const queue = (step: (() => void) | null) => {
      if (step !== null) play.push(step);
    };

    kept.forEach((slot, i) => {
      const part = nextParts[i];
      if (fresh.has(slot)) {
        queue(enter(slot, motion));

        return;
      }

      if (slot.leaving !== null) queue(revive(slot, motion));

      const previous = slot.part;
      setPart(slot, part);
      if (previous.char === part.char) return;

      if (animate && reduced) {
        show(slot, part);
        queue(crossfade(slot));

        return;
      }

      if (slot.column !== null) {
        queue(spin(slot, part.digit ?? 0, motion));

        return;
      }

      queue(roll(slot, part.char, motion));
    });

    // Without motion or a hold, a slot that left is gone in the same frame.
    const instant = motion.duration === 0 && shrinkDelay === 0;
    for (const slot of leavingNow) {
      if (instant) {
        slot.el.remove();
        stillLeaving.delete(slot);
        continue;
      }

      queue(leave(slot, motion));
    }

    slots = orderSlots(kept, stillLeaving);
    placeInOrder(
      root,
      slots.map((s) => s.el),
    );

    if (glide) {
      for (const [slot, left] of before) {
        if (!keptSet.has(slot)) continue;

        const dx = left - slot.el.getBoundingClientRect().left;
        if (Math.abs(dx) < 0.5) continue;

        slot.el.style.transform = `translateX(${dx}px)`;
        play.push(() => {
          slot.el.style.transition = `transform ${motion.duration}ms ${EASE}, ${MUTE_TRANSITION}`;
          slot.el.style.transform = '';
        });
      }
    }

    // One reflow commits every start state; the transitions then run from there.
    if (play.length > 0) {
      void root.offsetWidth;
      for (const step of play) {
        step();
      }
    }

    text = nextText;
    value = nextValue;
    parts = nextParts;
    changedAt = now;
    root.setAttribute('aria-label', nextText);
  }

  return {
    update,
    setOptions(opts) {
      spinDuration = opts.spinDuration ?? spinDuration;
      shrinkDelay = opts.shrinkDelay ?? shrinkDelay;
      decimal = opts.decimal ?? decimal;
    },
    destroy() {
      for (const slot of slots) {
        clearLeaving(slot);
        slot.el.remove();
      }
      slots = [];
      text = null;
    },
  };
}
