/**
 * ScalarSpring — the velocity-continuous chase primitive behind the live
 * OHLC / line / bar value smoothing (#8). Pins the property the old easing
 * Animator lacked: a mid-flight retarget carries the current velocity instead
 * of restarting the curve at its maximal-slope t=0 ("the kick").
 */
import { describe, expect, it } from 'vitest';

import { ScalarSpring } from '../../animation/scalar-spring';

describe('ScalarSpring', () => {
  it('critically damped — converges without overshooting the target', () => {
    const s = new ScalarSpring(0);
    s.retarget(10, { now: 0, settleMs: 200 });

    let maxSeen = Number.NEGATIVE_INFINITY;
    for (let t = 0; t <= 600; t += 16) {
      s.tick(t);
      maxSeen = Math.max(maxSeen, s.current);
    }

    expect(maxSeen).toBeLessThanOrEqual(10 + 1e-6); // never past the target
    expect(Math.abs(s.current - 10)).toBeLessThan(0.01); // and arrives
  });

  it('snaps to the exact target and reports settled once converged', () => {
    const s = new ScalarSpring(0);
    s.retarget(5, { now: 0, settleMs: 100 });

    let animating = true;
    let t = 0;
    while (animating && t < 4000) {
      t += 16;
      animating = s.tick(t);
    }

    expect(animating).toBe(false);
    expect(s.current).toBe(5); // exact, not just within ε
  });

  it('carries velocity through a mid-flight retarget (no easing "kick")', () => {
    const s = new ScalarSpring(0);
    s.retarget(100, { now: 0, settleMs: 300 });

    // Instantaneous-ish velocity (1 ms finite diff) just before the retarget.
    s.tick(99);
    const x99 = s.current;
    s.tick(100);
    const x100 = s.current;
    const vBefore = x100 - x99;
    expect(vBefore).toBeGreaterThan(0);

    // Retarget further in the same direction, mid-flight.
    s.retarget(200, { now: 100, settleMs: 300 });

    // Position is continuous — no jump toward the new target.
    expect(Math.abs(s.current - x100)).toBeLessThan(1e-6);

    // Velocity just after the retarget.
    const xRe = s.current;
    s.tick(101);
    const vAfter = s.current - xRe;

    // Still moving forward, and within a factor of 2 of the pre-retarget
    // velocity — a curve restart would inject a several-fold step instead.
    expect(vAfter).toBeGreaterThan(vBefore * 0.5);
    expect(vAfter).toBeLessThan(vBefore * 2);
  });

  it('is frame-rate independent — coarse and fine stepping land together', () => {
    const coarse = new ScalarSpring(0);
    const fine = new ScalarSpring(0);
    coarse.retarget(50, { now: 0, settleMs: 250 });
    fine.retarget(50, { now: 0, settleMs: 250 });

    for (let t = 0; t <= 200; t += 50) {
      coarse.tick(t);
    }
    for (let t = 0; t <= 200; t += 4) {
      fine.tick(t);
    }

    expect(Math.abs(coarse.current - fine.current)).toBeLessThan(1e-6);
  });

  it('snaps immediately when retargeted with settleMs <= 0 is left to the caller; bare retarget eases', () => {
    // ScalarSpring itself never snaps on a 0 settle (callers short-circuit that),
    // but a bare retarget must still ease toward the target rather than jump.
    const s = new ScalarSpring(0);
    s.retarget(10, { now: 0 });
    s.tick(1);
    expect(s.current).toBeGreaterThan(0);
    expect(s.current).toBeLessThan(10);
  });
});
