// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type NumberFlowHandle, type NumberFlowOptions, mountNumberFlow } from '../number-flow';

const SPIN = 350;

let root: HTMLSpanElement;
let flow: NumberFlowHandle;
let clock = 1_000;

function mount(opts: NumberFlowOptions = {}): void {
  root = document.createElement('span');
  document.body.append(root);
  flow = mountNumberFlow(root, { spinDuration: SPIN, ...opts });
}

/** Shows `text` one spin after the previous text, so the change animates. */
function step(text: string, value: number): void {
  clock += 1_000;
  flow.update(text, value);
}

function slots(): HTMLElement[] {
  return Array.from(root.children) as HTMLElement[];
}

/** The digit column of a slot, `null` for a symbol slot. */
function column(slot: HTMLElement): HTMLElement | null {
  return slot.firstElementChild?.firstElementChild as HTMLElement | null;
}

function text(): string {
  return slots()
    .map((slot) => {
      const col = column(slot);
      if (col === null) return slot.textContent;

      const cell = Math.round(-Number.parseFloat(col.style.transform.replace('translateY(', '')) / 1.2);

      return String(cell % 10);
    })
    .join('');
}

function stubReducedMotion(matches: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches })),
  );
}

beforeEach(() => {
  clock = 1_000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  // happy-dom answers `prefers-reduced-motion: reduce` with a match.
  stubReducedMotion(false);
  mount();
});

afterEach(() => {
  flow.destroy();
  root.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('mountNumberFlow', () => {
  it('renders one slot per character with its part and mute', () => {
    flow.update('0.0₅8123', 0.000008123);

    expect(slots().map((s) => s.dataset.part)).toEqual([
      'integer',
      'decimal',
      'fraction',
      'zeros',
      'fraction',
      'fraction',
      'fraction',
      'fraction',
    ]);
    expect(slots().map((s) => 'muted' in s.dataset)).toEqual([true, true, true, true, false, false, false, false]);
    expect(text()).toBe('0.058123');
    expect(root.getAttribute('aria-label')).toBe('0.000008123');
    expect(root.getAttribute('role')).toBe('img');
  });

  it('keeps the slots by place when a digit is added in front', () => {
    flow.update('99.50', 99.5);
    const [nine1, nine0, point, five, zero] = slots();

    step('100.50', 100.5);

    expect(slots()).toHaveLength(6);
    expect(slots().slice(1)).toEqual([nine1, nine0, point, five, zero]);
    expect(text()).toBe('100.50');
  });

  it('keeps the slots by significant position when the suffix changes', () => {
    flow.update('987.6M', 987.6e6);
    const [d0, d1, d2, point, d3, suffix] = slots();

    step('1.012B', 1.012e9);

    expect(slots()).toEqual([d0, point, d1, d2, d3, suffix]);
    expect(suffix.textContent).toBe('B');
    expect(text()).toBe('1.012B');
  });

  it('spins the zero count and the digits in place when the count changes', () => {
    flow.update('0.0₅8123', 0.000008123);
    const before = slots();

    step('0.0₄1234', 0.00001234);

    expect(slots()).toEqual(before);
    expect(text()).toBe('0.041234');
  });

  it('steps 9 → 0 forward on a rise and 0 → 9 back on a fall', () => {
    flow.update('19', 19);
    step('20', 20);

    const ones = slots()[1];
    expect(column(ones)?.style.transform).toBe('translateY(-12em)');
    expect(column(ones)?.style.transition).toContain(`${SPIN}ms`);

    step('19', 19);
    expect(column(ones)?.style.transform).toBe('translateY(-10.8em)');
  });

  it('rolls the zero count against the trend of the value', () => {
    flow.update('0.0₅9', 0.000009);
    step('0.0₄1', 0.00001);

    const count = slots()[3];
    // 5 → 4 is one step down, not nine up.
    expect(column(count)?.style.transform).toBe('translateY(-16.8em)');
  });

  it('snaps when a value comes before the last spin ends', () => {
    flow.update('1', 1);
    clock += 25;
    flow.update('2', 2);

    expect(column(slots()[0])?.style.transition).toBe('none');
    expect(text()).toBe('2');
  });

  it('lands the spin of an unchanged digit when a value snaps', () => {
    flow.update('19', 19);
    step('20', 20);
    const tens = column(slots()[0]);
    expect(tens?.style.transition).toContain(`${SPIN}ms`);

    clock += 25;
    flow.update('21', 21);

    expect(tens?.style.transition).toBe('none');
    expect(column(slots()[1])?.style.transition).toBe('none');
    expect(text()).toBe('21');
  });

  it('lands the width transition of an entered character when a value snaps', () => {
    flow.update('99', 99);
    step('100', 100);
    const lead = slots()[0];
    expect(lead.style.transition).toContain('grid-template-columns');

    clock += 25;
    flow.update('101', 101);

    expect(lead.style.transition).not.toContain('grid-template-columns');
    expect(lead.style.gridTemplateColumns).toBe('1fr');
  });

  it('removes a character that left without a hold', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    flow.update('100.5', 100.5);
    step('99.5', 99.5);

    expect(slots()).toHaveLength(5);
    vi.advanceTimersByTime(SPIN);
    expect(slots()).toHaveLength(4);
    expect(text()).toBe('99.5');
  });

  it('holds the width of a character that left for the shrink delay and revives it on return', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    flow.destroy();
    mount({ shrinkDelay: 1_000 });

    flow.update('100.5', 100.5);
    const lead = slots()[0];
    step('99.5', 99.5);

    vi.advanceTimersByTime(900);
    expect(slots()).toContain(lead);
    expect(lead.style.gridTemplateColumns).toBe('1fr');

    step('100.7', 100.7);
    vi.advanceTimersByTime(5_000);
    expect(slots()[0]).toBe(lead);
    expect(text()).toBe('100.7');
  });

  it('collapses a held character after the delay', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    flow.destroy();
    mount({ shrinkDelay: 1_000 });

    flow.update('100.5', 100.5);
    const lead = slots()[0];
    step('99.5', 99.5);

    vi.advanceTimersByTime(1_000);
    expect(lead.style.gridTemplateColumns).toBe('0fr');
    vi.advanceTimersByTime(SPIN);
    expect(slots()).not.toContain(lead);
  });

  it('fades a changed digit in instead of spinning under reduced motion', () => {
    stubReducedMotion(true);
    flow.update('1', 1);
    step('2', 2);

    const slot = slots()[0];
    expect(column(slot)?.style.transition).toBe('none');
    expect((slot.firstElementChild as HTMLElement).style.transition).toContain('opacity');
    expect(text()).toBe('2');
  });

  it('removes its slots on destroy', () => {
    flow.update('1.5K', 1500);
    flow.destroy();

    expect(root.children).toHaveLength(0);
  });
});
