/**
 * YRangeSpring — critically-damped spring tracking a YRange. Unlike the X
 * spring it selects ω per side AND per direction: a bound reaching a new
 * extreme (outward) uses the call's `expandMs`; a bound contracting after an
 * extreme leaves the window uses the slower `contractMs` — this is the
 * sticky-Y mechanism. Settle times arrive per `retarget` call; the curve
 * carries no baseline of its own (the engine owns durations).
 */
import { describe, expect, it } from 'vitest';

import { YRangeSpring } from '../../animation/y-range-spring';

describe('YRangeSpring', () => {
  it('starts pinned to the initial range and settled', () => {
    const spring = new YRangeSpring({ initial: { min: 0, max: 100 } });

    expect(spring.current).toEqual({ min: 0, max: 100 });
    expect(spring.target).toEqual({ min: 0, max: 100 });
    expect(spring.animating).toBe(false);
  });

  it('tick before any retarget primes the clock and reports settled', () => {
    const spring = new YRangeSpring({ initial: { min: 0, max: 100 } });

    expect(spring.tick(50)).toBe(false);
    expect(spring.current).toEqual({ min: 0, max: 100 });
  });

  it('first retarget steps from rest toward the new range without overshoot', () => {
    const spring = new YRangeSpring({ initial: { min: 0, max: 100 } });

    // Cold retarget: target is set, motion is sampled from rest on later ticks.
    spring.retarget({ min: 20, max: 80 }, { now: 0, expandMs: 200 });
    expect(spring.target).toEqual({ min: 20, max: 80 });

    spring.tick(0);
    expect(spring.current).toEqual({ min: 0, max: 100 });

    // Across the settle window min rises 0→20 and max falls 100→80. A
    // critically-damped step from rest never crosses its target.
    let prevMin = 0;
    let prevMax = 100;
    for (const t of [40, 80, 160, 320]) {
      spring.tick(t);
      const { min, max } = spring.current;

      expect(min).toBeGreaterThanOrEqual(prevMin);
      expect(min).toBeLessThanOrEqual(20);
      expect(max).toBeLessThanOrEqual(prevMax);
      expect(max).toBeGreaterThanOrEqual(80);

      prevMin = min;
      prevMax = max;
    }

    // Well past 5× the settle time, converged onto the target exactly.
    spring.tick(2000);
    expect(spring.current.min).toBeCloseTo(20, 1);
    expect(spring.current.max).toBeCloseTo(80, 1);
    expect(spring.animating).toBe(false);
  });

  it('expands faster than it contracts (direction-aware ω)', () => {
    const spring = new YRangeSpring({ initial: { min: 0, max: 100 } });

    // Prime the clock at the initial range (cold path), then a warm retarget
    // that expands min DOWN (0 → −100, fast) and contracts max DOWN
    // (100 → 50, slow). A 10× gap between the two settle times.
    spring.retarget({ min: 0, max: 100 }, { now: 0, expandMs: 100, contractMs: 1000 });
    spring.retarget({ min: -100, max: 50 }, { now: 0, expandMs: 100, contractMs: 1000 });

    spring.tick(100);
    const minProgress = (0 - spring.current.min) / (0 - -100); // 0→1 toward −100
    const maxProgress = (100 - spring.current.max) / (100 - 50); // 0→1 toward 50

    // After the same 100 ms the expanding bound is far ahead of the
    // contracting one — the chart snaps open and lingers on contract.
    expect(minProgress).toBeGreaterThan(0.9);
    expect(maxProgress).toBeLessThan(0.5);
    expect(minProgress).toBeGreaterThan(maxProgress);
  });

  it('snap lands instantly with zero velocity', () => {
    const spring = new YRangeSpring({ initial: { min: 0, max: 100 } });

    spring.snap({ min: -50, max: 250 }, { now: 0 });

    expect(spring.current).toEqual({ min: -50, max: 250 });
    expect(spring.target).toEqual({ min: -50, max: 250 });
    expect(spring.animating).toBe(false);
  });

  it('mid-flight retarget carries velocity over (no curve restart)', () => {
    const spring = new YRangeSpring({ initial: { min: 0, max: 100 } });

    spring.retarget({ min: -100, max: 200 }, { now: 0, expandMs: 200 });
    spring.tick(0);
    spring.tick(80);
    const mid = spring.current;
    expect(mid.max).toBeGreaterThan(100);
    expect(mid.max).toBeLessThan(200);

    // Retarget further out while still moving; the carried velocity keeps
    // pushing max outward instead of restarting from `mid` at zero speed.
    spring.retarget({ min: -100, max: 210 }, { now: 80, expandMs: 200 });
    spring.tick(96);
    expect(spring.current.max).toBeGreaterThan(mid.max);
  });

  it('animating flips to false once settled within eps', () => {
    const spring = new YRangeSpring({ initial: { min: 0, max: 100 } });

    spring.retarget({ min: 10, max: 110 }, { now: 0, expandMs: 100 });
    spring.tick(0);
    expect(spring.animating).toBe(true);

    spring.tick(1000);
    expect(spring.animating).toBe(false);
    expect(spring.current).toEqual({ min: 10, max: 110 });
  });

  it('snap mid-flight zeros velocity and halts drift', () => {
    const spring = new YRangeSpring({ initial: { min: 0, max: 100 } });

    spring.retarget({ min: -200, max: 300 }, { now: 0, expandMs: 200 });
    spring.tick(80);
    expect(spring.animating).toBe(true);

    spring.snap({ min: 5, max: 95 }, { now: 80 });
    expect(spring.animating).toBe(false);

    spring.tick(400);
    expect(spring.current).toEqual({ min: 5, max: 95 });
  });
});
