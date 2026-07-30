/**
 * Decorative animations — intro waves, badge hops, the gridline reveal — are
 * skipped entirely under `prefers-reduced-motion`. Motion that carries meaning
 * (viewport tweens tracking a gesture, tick relabels) is not covered here.
 *
 * Read at arm time rather than cached: a chart built before the user flips the
 * OS setting should honor the new value on its next arm.
 */
export function prefersReducedMotion(): boolean {
  if (typeof matchMedia !== 'function') return false;

  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}
