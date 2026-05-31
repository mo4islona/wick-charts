import { describe, expect, it } from 'vitest';

import { YRangeHermite } from '../../animation/y-range-hermite';

/**
 * Drive the Hermite Y animator with explicit clock values so behavior is
 * deterministic. The default Y curve must not balloon the bound *further
 * outward* when an outward velocity is carried into an inward (contract)
 * retarget — a visible overshoot on ordinary streaming.
 */
describe('YRangeHermite velocity projection on adverse retarget', () => {
  it('does not overshoot past the retarget position when contracting against carried outward velocity', () => {
    const h = new YRangeHermite({ initial: { min: 0, max: 100 } });

    // Fast outward expand — builds a large positive (outward) velocity on max.
    h.snap({ min: 0, max: 100 }, { now: 0 });
    h.retarget({ min: 0, max: 200 }, { now: 0, expandMs: 250, contractMs: 2500 });

    // Sample partway so max is moving outward fast.
    h.tick(60);
    const maxAtRetarget = h.current.max;
    expect(maxAtRetarget).toBeGreaterThan(100);
    expect(maxAtRetarget).toBeLessThan(200);

    // Now retarget *inward* to a target BELOW the current position while that
    // outward velocity is still live, using the long sticky contract duration.
    // Travel is downward but the carried velocity points up (adverse) and must
    // be dropped — the bound should only ever move inward (down) from here,
    // never balloon past `maxAtRetarget`.
    h.retarget({ min: 0, max: 105 }, { now: 60, expandMs: 250, contractMs: 2500 });

    let peak = h.current.max;
    for (let t = 70; t <= 2600; t += 16) {
      h.tick(t);
      peak = Math.max(peak, h.current.max);
    }

    const eps = 1e-3;
    // Without the projection fix the carried outward velocity pushes max well
    // past the retarget position before settling back down to 105.
    expect(peak).toBeLessThanOrEqual(maxAtRetarget + eps);
    // And it converges to the new target.
    expect(h.current.max).toBeCloseTo(105, 2);
  });

  it('preserves velocity for same-direction retargets (still glides past the old target)', () => {
    const h = new YRangeHermite({ initial: { min: 0, max: 100 } });
    h.snap({ min: 0, max: 100 }, { now: 0 });
    h.retarget({ min: 0, max: 200 }, { now: 0, expandMs: 250, contractMs: 2500 });
    h.tick(60);

    // Retarget further outward — same direction, velocity should be retained so
    // the motion stays smooth (no decel/re-accel). Just assert it keeps rising
    // monotonically toward the new, larger target.
    h.retarget({ min: 0, max: 300 }, { now: 60, expandMs: 250, contractMs: 2500 });
    let prev = h.current.max;
    for (let t = 76; t <= 400; t += 16) {
      h.tick(t);
      expect(h.current.max).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = h.current.max;
    }
    expect(h.current.max).toBeCloseTo(300, 2);
  });
});
