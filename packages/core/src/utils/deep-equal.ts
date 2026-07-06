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

  // Dates carry their value in an internal slot, not enumerable keys — a
  // key-based walk would call any two Dates equal. `TimeValue` endpoints
  // (visibleRange & co.) are the load-bearing case.
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }

  // Any other class instance (RegExp, Map, Set, user classes) also hides its
  // state from Object.keys — honor the documented contract and compare those
  // by reference (already known unequal here) instead of as empty bags.
  if (!isPlainObject(a) || !isPlainObject(b)) return false;

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);

  return aKeys.length === bKeys.length && aKeys.every((key) => key in bObj && deepEqual(aObj[key], bObj[key]));
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);

  return proto === Object.prototype || proto === null;
}
