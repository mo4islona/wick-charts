/**
 * BadgeAnimator — the last-value badge's motion shared by the React / Vue /
 * Svelte YLabels. Pins the behaviors the DOM badge needs: the position glides
 * to every new value with a single velocity-continuous spring (never snaps),
 * the digit value steps discretely so the roll fires per point (not per frame),
 * and the intro counts up + fades in with the reveal.
 */
import { describe, expect, it } from 'vitest';

import { BadgeAnimator } from '../../chart/badge-animator';

describe('BadgeAnimator', () => {
  it('intro: counts the value from the first visible sample up to the last, locked to the front', () => {
    const badge = new BadgeAnimator(100);

    const at = (introFront: number) => badge.frame({ target: 200, firstVisible: 100, introFront, now: 0 });

    expect(at(0).textValue).toBeCloseTo(100, 6);
    expect(at(0.5).textValue).toBeCloseTo(150, 6);
    expect(at(1 - 1e-9).textValue).toBeCloseTo(200, 3);
    // Position tracks the counted value so text and Y never desync.
    expect(at(0.5).positionValue).toBeCloseTo(150, 6);
  });

  it('intro: countUp=false holds the final value while still fading in', () => {
    const badge = new BadgeAnimator(100);

    const out = badge.frame({ target: 200, firstVisible: 100, introFront: 0.05, now: 0, countUp: false });

    expect(out.textValue).toBe(200); // no count-up — sits on the final value
    expect(out.positionValue).toBe(200);
    expect(out.opacity).toBeLessThan(1); // but still fades in over the reveal
  });

  it('intro: fades the badge in over the leading slice of the reveal', () => {
    const badge = new BadgeAnimator(100);

    const opacityAt = (introFront: number) =>
      badge.frame({ target: 200, firstVisible: 100, introFront, now: 0 }).opacity;

    expect(opacityAt(0)).toBe(0);
    expect(opacityAt(0.075)).toBeCloseTo(0.5, 2); // half-way up the 0.15 fade band
    expect(opacityAt(0.2)).toBe(1); // fully opaque well before the reveal completes
  });

  it('append: eases the position to a new value instead of teleporting, and never snaps', () => {
    const badge = new BadgeAnimator(100);

    // Settle the intro so the steady-state path takes over.
    badge.frame({ target: 100, firstVisible: 100, introFront: 1, now: 0 });

    // A new value — the position must ease toward it, digits step immediately.
    const first = badge.frame({ target: 110, firstVisible: 100, introFront: 1, now: 16 });
    expect(first.positionValue).toBeLessThan(110);
    expect(first.positionValue).toBeGreaterThanOrEqual(100);
    expect(first.textValue).toBe(110); // digits step immediately, once
    expect(first.animating).toBe(true);

    // No single frame ever steps the whole remaining distance (no snap).
    let out = first;
    let prev = first.positionValue;
    let maxStep = 0;
    for (let t = 32; t < 2000 && out.animating; t += 16) {
      out = badge.frame({ target: 110, firstVisible: 100, introFront: 1, now: t });
      maxStep = Math.max(maxStep, Math.abs(out.positionValue - prev));
      prev = out.positionValue;
    }

    expect(maxStep).toBeLessThan(5); // eases in small increments, no jump to target
    expect(out.animating).toBe(false);
    expect(out.positionValue).toBeCloseTo(110, 6);
  });

  it('a value jump that lands mid-glide stays smooth (velocity-continuous, no snap)', () => {
    const badge = new BadgeAnimator(100);
    badge.frame({ target: 100, firstVisible: 100, introFront: 1, now: 0 });

    // Start a glide, then retarget partway through — the position must not step.
    let prev = badge.frame({ target: 120, firstVisible: 100, introFront: 1, now: 16 }).positionValue;
    let maxStep = 0;
    for (let t = 32; t < 800; t += 16) {
      const target = t === 160 ? 130 : t > 160 ? 130 : 120; // jump to a new value mid-glide
      const out = badge.frame({ target, firstVisible: 100, introFront: 1, now: t });
      maxStep = Math.max(maxStep, Math.abs(out.positionValue - prev));
      prev = out.positionValue;
    }

    expect(maxStep).toBeLessThan(5); // the mid-glide retarget introduces no kick
  });

  it('animate={false} (glide + countUp both off): fully visible immediately during the intro, no frames', () => {
    const badge = new BadgeAnimator(100);

    // Mid-intro: with both motions off the badge must not apply the entrance
    // fade — a partial opacity + animating:false would freeze it half-transparent.
    const out = badge.frame({
      target: 200,
      firstVisible: 100,
      introFront: 0.05,
      now: 0,
      glide: false,
      countUp: false,
    });

    expect(out.positionValue).toBe(200);
    expect(out.textValue).toBe(200);
    expect(out.opacity).toBe(1);
    expect(out.animating).toBe(false);
  });

  it('glide and countUp are independent: glide off still counts up during the intro', () => {
    const badge = new BadgeAnimator(100);

    const mid = badge.frame({ target: 200, firstVisible: 100, introFront: 0.5, now: 0, glide: false, countUp: true });
    expect(mid.textValue).toBeCloseTo(150, 6); // count-up runs even with glide off
    expect(mid.opacity).toBe(1); // past the fade band
    expect(mid.animating).toBe(true);

    // After the intro settles, glide off snaps the position (no easing).
    badge.frame({ target: 200, firstVisible: 100, introFront: 1, now: 16, glide: false, countUp: true });
    const settled = badge.frame({
      target: 260,
      firstVisible: 100,
      introFront: 1,
      now: 32,
      glide: false,
      countUp: true,
    });
    expect(settled.positionValue).toBe(260);
    expect(settled.animating).toBe(false);
  });

  it('glide=false snaps the position with no in-flight frames', () => {
    const badge = new BadgeAnimator(100);
    badge.frame({ target: 100, firstVisible: 100, introFront: 1, now: 0 });

    const out = badge.frame({ target: 140, firstVisible: 100, introFront: 1, now: 16, glide: false });

    expect(out.positionValue).toBe(140);
    expect(out.textValue).toBe(140);
    expect(out.animating).toBe(false);
  });

  it('reduced motion: snaps to the target at full opacity with no in-flight frames', () => {
    const badge = new BadgeAnimator(100);

    const out = badge.frame({ target: 200, firstVisible: 100, introFront: 0.3, now: 0, reducedMotion: true });

    expect(out.positionValue).toBe(200);
    expect(out.textValue).toBe(200);
    expect(out.opacity).toBe(1);
    expect(out.animating).toBe(false);
  });
});
