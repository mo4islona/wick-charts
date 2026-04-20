/**
 * Cumulative sum of stacked layer values for a single time bucket.
 *
 * Hidden layers must already be zeroed by the caller — `sumStack` does not
 * consult visibility. Positive and negative contributions are summed
 * independently (positives stack upward, negatives downward), mirroring how
 * `LineRenderer` and `BarRenderer` build their stacked geometry.
 */
export interface StackTotals {
  /** Sum of all positive layer values (upward stack top). */
  positive: number;
  /** Sum of all negative layer values (downward stack top, ≤ 0). */
  negative: number;
}

export function sumStack(layerValues: readonly number[]): StackTotals {
  let positive = 0;
  let negative = 0;
  for (const v of layerValues) {
    if (v > 0) positive += v;
    else if (v < 0) negative += v;
  }

  return { positive, negative };
}

/**
 * Value at the rendered stack head for normal stacking — the point an
 * overlay (e.g. `<YLabel />`) should anchor to.
 *
 * Matches how `BarRenderer.renderStacked` and the stroke edge of
 * `LineRenderer.renderStacked` draw geometry: positives stack upward
 * independently of negatives, so the painted head sits at whichever side
 * actually has contributions.
 *
 * - Any positive contribution → cumulative positive top.
 * - Otherwise any negative contribution → cumulative negative bottom.
 * - Nothing visible → 0.
 */
export function renderedStackTop(totals: StackTotals): number {
  if (totals.positive > 0) return totals.positive;
  if (totals.negative < 0) return totals.negative;

  return 0;
}

/**
 * Percent-mode counterpart of {@link renderedStackTop}. Percent stacking
 * normalizes positives to +100 and negatives to -100 independently; the
 * rendered head lands on whichever side actually has contributions.
 */
export function renderedStackPercentTop(totals: StackTotals): number {
  if (totals.positive > 0) return 100;
  if (totals.negative < 0) return -100;

  return 0;
}
