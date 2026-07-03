import { useRef } from 'react';

/**
 * Latch a possibly-unstable single-argument function behind a stable wrapper.
 *
 * The wrapper's identity never changes while a function is present, so it is
 * safe to hand to the chart core and to list in effect dep arrays — a new
 * inline function on every render no longer re-fires the option effect. The
 * wrapper delegates to the latest function on each call, so the core (which
 * reads options live, per frame) always sees the freshest behavior.
 *
 * Returns `undefined` when `fn` is `undefined` so the core can fall back to
 * its own default. The identity therefore flips only on presence changes —
 * exactly when the option effect must re-fire.
 */
export function useLatestFn<A, R>(fn: ((arg: A) => R) | undefined): ((arg: A) => R) | undefined {
  const latest = useRef(fn);
  latest.current = fn;

  // One frame may elapse between a render that drops `fn` and the effect that
  // propagates `undefined` to the core — return no directives for that frame.
  const stable = useRef((arg: A): R => {
    const current = latest.current;
    if (!current) return {} as R;

    return current(arg);
  });

  return fn ? stable.current : undefined;
}
