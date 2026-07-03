import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { IntroWave } from '../../animation/intro-wave';

/**
 * The global test setup reports `prefers-reduced-motion: reduce` so every
 * renderer test sees settled first frames. These tests exercise the wave
 * itself, so they swap in a motion-allowing `matchMedia` and restore the
 * global stub afterwards.
 */
const reducedMotionStub = globalThis.matchMedia;

function allowMotion(): void {
  globalThis.matchMedia = ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof globalThis.matchMedia;
}

describe('IntroWave', () => {
  beforeEach(() => {
    allowMotion();
  });
  afterEach(() => {
    globalThis.matchMedia = reducedMotionStub;
  });

  it('is settled until armed', () => {
    const wave = new IntroWave();
    expect(wave.active).toBe(false);
    expect(wave.progressAt(0.5)).toBe(1);
    expect(wave.sweep()).toBe(1);
  });

  it('arm(0) is a no-op', () => {
    const wave = new IntroWave();
    wave.arm(0);
    expect(wave.active).toBe(false);
  });

  it('stamps its start on the first tick and reports 0 progress before it', () => {
    const wave = new IntroWave();
    wave.arm(500);
    expect(wave.active).toBe(true);
    expect(wave.progressAt(0)).toBe(0);
    expect(wave.sweep()).toBe(0);

    wave.tick(1000);
    expect(wave.progressAt(0)).toBe(0);
  });

  it('a first tick at now = 0 stamps the start (no sentinel collision)', () => {
    const wave = new IntroWave();
    wave.arm(500);
    wave.tick(0);

    wave.tick(400);
    expect(wave.progressAt(0)).toBeGreaterThan(0);

    wave.tick(1000);
    expect(wave.active).toBe(false);
  });

  it('staggers by position — earlier positions finish first', () => {
    const wave = new IntroWave();
    wave.arm(500);
    wave.tick(1000);
    wave.tick(1400);

    const left = wave.progressAt(0);
    const mid = wave.progressAt(0.5);
    const right = wave.progressAt(1);
    expect(left).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(right);
    // position 0 started at delay 0 → 80% through its 500ms tween.
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThan(1);
    // position 1 starts after a full 500ms delay → untouched at 400ms.
    expect(right).toBe(0);
  });

  it('settles after the full 2× window', () => {
    const wave = new IntroWave();
    wave.arm(500);
    wave.tick(1000);
    wave.tick(1999);
    expect(wave.active).toBe(true);

    wave.tick(2000);
    expect(wave.active).toBe(false);
    expect(wave.progressAt(1)).toBe(1);
    expect(wave.sweep()).toBe(1);
  });

  it('finish() aborts mid-flight', () => {
    const wave = new IntroWave();
    wave.arm(500);
    wave.tick(1000);
    wave.finish();
    expect(wave.active).toBe(false);
    expect(wave.progressAt(0.9)).toBe(1);
  });

  it('sweep is monotonic and clamped to [0, 1]', () => {
    const wave = new IntroWave();
    wave.arm(500);
    wave.tick(1000);

    let prev = wave.sweep();
    for (const t of [1100, 1300, 1500, 1700, 1900]) {
      wave.tick(t);
      const s = wave.sweep();
      expect(s).toBeGreaterThanOrEqual(prev);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
      prev = s;
    }
  });

  it('respects prefers-reduced-motion — arm becomes a no-op', () => {
    globalThis.matchMedia = reducedMotionStub;

    const wave = new IntroWave();
    wave.arm(500);
    expect(wave.active).toBe(false);
  });
});
