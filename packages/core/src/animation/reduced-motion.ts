/**
 * Decorative motion — intro waves, badge hops, the gridline reveal — is skipped
 * under `prefers-reduced-motion`. Meaningful motion (gesture tweens, relabels)
 * is not. Read at arm time so an OS-setting flip is honored on the next arm.
 */
export function prefersReducedMotion(): boolean {
  if (typeof matchMedia !== 'function') return false;

  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}
