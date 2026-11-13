/**
 * Generic "skip + warn-once" reporter for poisoned upstream data.
 *
 * Series renderers (`candlestick`, `bar`, `line`, …) all face the same
 * class of bug: a single bar / point with `NaN` or `±Infinity` in a
 * numeric field propagates through the scale arithmetic into
 * `ctx.createLinearGradient(NaN, ...)` (or similar canvas calls) and
 * crashes the whole frame. The fix at every site is the same — filter
 * the bad rows out, then warn the integrator so they can clean their
 * feed.
 *
 * To keep that filter cheap and side-effect-free for the common
 * everything-finite case, the state (which renderers have already warned)
 * lives in a module-level `WeakMap`, not on the renderer class, so:
 *
 *  - No renderer needs an extra `#warnedPoisoned` field.
 *  - Disposed renderers get GC'd normally (WeakMap entries clear).
 *  - The first poisoned render emits one batched warning listing
 *    *every* offending index — subsequent renders against the same
 *    instance stay silent.
 *
 * Renderers pass their own `this` as the token. Two renderer instances
 * (e.g. two charts on the same page) each get their own one-shot
 * warning.
 */

/**
 * Tighter "is this value a NaN / ±Infinity number" predicate than
 * `!Number.isFinite(v)`: it deliberately lets `null` / `undefined`
 * through because their `valueToY` arithmetic coerces them to `0` and
 * the renderers ship working behavior for that case — filtering them
 * here would visibly hide bars that previously rendered.
 */
export function isPoisonedNumber(v: number | null | undefined): boolean {
  return typeof v === 'number' && !Number.isFinite(v);
}

/** How much a data note matters: `error` misreads the data, `warning` drops some of it, `info` fixed it. */
export type DataNoteSeverity = 'error' | 'warning' | 'info';

/** What the chart dropped, fixed or misread in a series' input. `ChartInstance.describe()` lists these. */
export interface DataNote {
  readonly topic: string;
  readonly severity: DataNoteSeverity;
  readonly message: string;
}

export type DataNoteSink = (note: DataNote) => void;

// Set by the chart around each call into a series, so a store or renderer reports without a chart reference.
let currentSink: DataNoteSink | null = null;

/** Make `sink` receive every {@link noteData} call until the next swap; returns the sink it replaced. */
export function swapDataNoteSink(sink: DataNoteSink | null): DataNoteSink | null {
  const previous = currentSink;
  currentSink = sink;

  return previous;
}

/** Report `note` to the chart whose call is running; a no-op outside one. */
export function noteData(note: DataNote): void {
  currentSink?.(note);
}

/** Topics each token already warned about. */
const warned = new WeakMap<object, Set<string>>();

/**
 * `console.warn` `message` once per `token` and `topic`: a renderer or store
 * warns about each kind of bad input once, however often that input arrives.
 * The chart gets a {@link noteData} every time, so its notes stay current.
 */
export function warnDataOnce(args: {
  token: object;
  topic: string;
  message: string;
  severity?: DataNoteSeverity;
}): void {
  const { token, topic, message, severity = 'warning' } = args;
  noteData({ topic, severity, message });

  let topics = warned.get(token);
  if (topics === undefined) {
    topics = new Set();
    warned.set(token, topics);
  }

  if (topics.has(topic)) return;

  topics.add(topic);
  console.warn(`[wick-charts] ${message}`);
}

/**
 * `console.warn` once per `token`, listing every offending index in one
 * message so the integrator can audit the whole dirty feed in a single
 * pass instead of re-running with new data after each hidden bar pops up.
 *
 * @param token         Stable per-renderer identity. Pass `this`.
 * @param sourceLabel   Human-readable subsystem name (e.g. `"candlestick"`).
 * @param indices       Zero-based positions of every poisoned row.
 * @param firstBadAt    A description / time anchor of the first poisoned
 *                      row — embedded into the warning so the integrator
 *                      can correlate against the upstream feed.
 */
export function reportPoisonedData(
  token: object,
  sourceLabel: string,
  indices: readonly number[],
  firstBadAt: string | number,
): void {
  if (indices.length === 0) return;

  warnDataOnce({
    token,
    topic: 'poisoned',
    message:
      `${sourceLabel}: skipping ${indices.length} row${indices.length === 1 ? '' : 's'} ` +
      `with NaN / Infinity values (indices ${indices.join(', ')}; first offending row: ${firstBadAt}). ` +
      'Filter upstream data; the renderer drops poisoned rows to keep the rest of the chart alive.',
  });
}
