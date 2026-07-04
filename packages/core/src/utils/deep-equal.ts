/**
 * Structural equality for plain option bags that may carry function-valued
 * fields (e.g. `AnimationsConfig.axis.y.curve`, a transition factory).
 * Functions (and any other non-plain value) compare by reference — only
 * arrays and plain objects recurse. Used to tell a caller's brand-new inline
 * object literal (same values, new reference) apart from a genuine option
 * change, so wrappers can skip an expensive rebuild in the former case.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);

  return aKeys.length === bKeys.length && aKeys.every((key) => key in bObj && deepEqual(aObj[key], bObj[key]));
}
