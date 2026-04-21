/**
 * Wraps a `CanvasRenderingContext2D` in a Proxy that increments a per-method
 * counter each time a draw/state method is called. Non-function property
 * reads and setter assignments (e.g. `ctx.fillStyle = 'red'`) are forwarded
 * to the real context unchanged — we count *operations*, not state mutations.
 *
 * The tally Map is owned by the caller (typically a {@link PerfMonitor}) and
 * cleared externally between frames. Mutating the map in place avoids
 * reallocation on every frame.
 *
 * Note on `this`-binding: native canvas getters/setters (`fillStyle`,
 * `lineWidth`, …) rely on internal slots that only exist on the real context.
 * Both traps therefore pass `target` — not the proxy `receiver` — into
 * `Reflect.get` / `Reflect.set`, and method wrappers `apply(target, args)`.
 * Without this, the first `ctx.fillStyle = '…'` throws "Illegal invocation"
 * in real browsers.
 */
export function createCountingContext(
  ctx: CanvasRenderingContext2D,
  tally: Map<string, number>,
): CanvasRenderingContext2D {
  // Memoize wrappers per property key so high-frequency methods
  // (`lineTo`, `moveTo`, …) don't allocate a fresh closure per call —
  // that allocation pressure would perturb the timings we're measuring.
  const wrapperCache = new Map<PropertyKey, (...args: unknown[]) => unknown>();

  return new Proxy(ctx, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== 'function') return value;

      const cached = wrapperCache.get(prop);
      if (cached) return cached;

      const name = typeof prop === 'string' ? prop : String(prop);
      const fn = value as (...a: unknown[]) => unknown;
      const wrapper = (...args: unknown[]) => {
        tally.set(name, (tally.get(name) ?? 0) + 1);

        return fn.apply(target, args);
      };
      wrapperCache.set(prop, wrapper);

      return wrapper;
    },
    set(target, prop, value) {
      return Reflect.set(target, prop, value, target);
    },
  });
}
