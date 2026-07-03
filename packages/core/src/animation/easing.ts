export type Easing = (t: number) => number;

export const easeLinear: Easing = (t) => t;

export const easeOutCubic: Easing = (t) => 1 - (1 - t) ** 3;

export const easeInOutCubic: Easing = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

/** Decelerating with a soft ~7% overshoot past the target before settling.
 *  `c1` is deliberately below the canonical 1.70158 — series geometry
 *  overshoots in *pixels*, and the full-strength back curve reads as a
 *  rubber band on tall charts. */
export const easeOutBack: Easing = (t) => {
  const c1 = 1.30158;
  const c3 = c1 + 1;

  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};
