import { useRef } from 'react';

import { deepEqual } from '@wick-charts/core';

/**
 * Deep-compare latch: returns a reference to `value` that only changes
 * identity when its structural content actually differs from the previous
 * call. A caller that rebuilds an `options` object inline on every render
 * (same values, new reference) gets back the *old* reference here, so an
 * effect keyed on the result doesn't re-fire — replacing a hand-maintained
 * list of individual option fields with one generic diff.
 *
 * Function-valued fields (painters, formatters) still compare by reference,
 * matching the documented painter contract: a registry-name string diffs by
 * value, a raw function diffs by identity.
 */
export function useStableOptions<T>(value: T): T {
  const ref = useRef(value);
  if (!deepEqual(ref.current, value)) {
    ref.current = value;
  }

  return ref.current;
}
