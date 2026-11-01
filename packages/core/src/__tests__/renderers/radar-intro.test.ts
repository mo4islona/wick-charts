import { describe, expect, it } from 'vitest';

import {
  type RadarIntroFn,
  radarCascadeIntro,
  radarGrowIntro,
  radarInflateIntro,
  radarScanIntro,
  radarSpinIntro,
} from '../../series/radar-intro';

const INTROS: Record<string, RadarIntroFn> = {
  grow: radarGrowIntro(),
  scan: radarScanIntro(),
  spin: radarSpinIntro(),
  cascade: radarCascadeIntro(),
  inflate: radarInflateIntro(),
};

const FRAME = { layer: 0, layerCount: 3, axisCount: 5 };
const VERTEX = { axis: 2, fraction: 0.8, mean: 0.5 };

/** The drawn radius of {@link VERTEX}, or its fraction when the intro leaves vertices alone. */
function radiusAt(intro: RadarIntroFn, args: { progress: number; layer?: number }): number {
  const directives = intro({ ...FRAME, progress: args.progress, layer: args.layer ?? 0 });

  return directives.vertex?.(VERTEX) ?? VERTEX.fraction;
}

describe('radar intros', () => {
  for (const [name, intro] of Object.entries(INTROS)) {
    it(`${name} ends on the settled polygon`, () => {
      for (let layer = 0; layer < FRAME.layerCount; layer++) {
        const end = intro({ ...FRAME, progress: 1, layer });

        expect(end.vertex?.(VERTEX) ?? VERTEX.fraction).toBeCloseTo(VERTEX.fraction, 6);
        expect(end.rotation ?? 0).toBeCloseTo(0, 6);
        expect(end.alpha ?? 1).toBe(1);
        expect(end.reveal ?? 1).toBe(1);
        expect(end.dots ?? 1).toBe(1);
      }
    });

    it(`${name} shows nothing of the polygon at the start`, () => {
      const start = intro({ ...FRAME, progress: 0 });
      const radius = start.vertex?.(VERTEX) ?? VERTEX.fraction;
      const hidden = radius === 0 || (start.reveal ?? 1) === 0 || (start.alpha ?? 1) === 0;

      expect(hidden).toBe(true);
    });
  }

  it('grow never overshoots a vertex', () => {
    for (let progress = 0; progress <= 1; progress += 0.01) {
      expect(radiusAt(INTROS.grow, { progress })).toBeLessThanOrEqual(VERTEX.fraction + 1e-9);
    }
  });

  it('scan reveals the turn in order', () => {
    const reveals = [0.2, 0.5, 0.8].map((progress) => INTROS.scan({ ...FRAME, progress }).reveal ?? 1);

    expect(reveals[0]).toBeLessThan(reveals[1]);
    expect(reveals[1]).toBeLessThan(reveals[2]);
  });

  it('spin turns into place', () => {
    const early = INTROS.spin({ ...FRAME, progress: 0.2 }).rotation ?? 0;

    expect(early).toBeLessThan(0);
  });

  it('cascade starts each polygon after the one before', () => {
    const progress = 0.3;

    expect(radiusAt(INTROS.cascade, { progress, layer: 0 })).toBeGreaterThan(
      radiusAt(INTROS.cascade, { progress, layer: 2 }),
    );
  });

  it('inflate passes through the mean before the values', () => {
    const middle = radiusAt(INTROS.inflate, { progress: 0.48 });

    expect(middle).toBeCloseTo(VERTEX.mean, 1);
  });
});
