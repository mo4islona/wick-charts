import { roundedBarFill, roundedCandleFill, smoothCurve, steppedCurve, straightCurve } from './builtins';
import type { BarPainter, CandlePainter, LinePainter, PaintEnv } from './types';

/**
 * Painter resolution.
 *
 * A painter is supplied either as `undefined` (engine default), a built-in line
 * `curve` name, or a raw function handed straight to the series option. There is
 * no name registry: bar/candle rounding is driven by the serializable
 * `cornerRadius`, line smoothing by the serializable `curve`, and anything more
 * custom is just a function. The built-in curves are DIRECTLY imported, so
 * `packages/core`'s `"sideEffects": false` can never tree-shake them away.
 *
 * Every raw painter is wrapped so a throw falls back to the default fill instead
 * of aborting the frame (and its sibling series).
 */

const LINE_CURVES: Record<string, LinePainter> = {
  straight: straightCurve,
  smooth: smoothCurve,
  stepped: steppedCurve,
};

// Warn at most once per throwing painter — mirrors the `WeakSet` once-guard
// convention in utils/poisoned-data-reporter.ts. No `process.env` gating (absent
// from the browser ESM bundle): warn unconditionally but only once.
const warnedThrowing = new WeakSet<object>();

function warnThrowingPainter(kind: string, painter: object, error: unknown): void {
  if (warnedThrowing.has(painter)) return;

  warnedThrowing.add(painter);
  console.warn(`[wick-charts] a ${kind} painter threw; falling back to the default for this series.`, error);
}

/**
 * Wrap a raw painter so a throw is contained: it warns once for this painter and
 * then paints with `fallback`. Generic over the args shape so each series kind
 * keeps its concrete types (no `any`).
 */
function guard<TArgs>(
  kind: string,
  painter: (env: PaintEnv, args: TArgs) => void,
  fallback: (env: PaintEnv, args: TArgs) => void,
): (env: PaintEnv, args: TArgs) => void {
  return (env, args) => {
    try {
      painter(env, args);
    } catch (error) {
      warnThrowingPainter(kind, painter, error);
      fallback(env, args);
    }
  };
}

/** Resolve a bar-painter option (raw function or undefined) to a callable.
 *  `undefined` uses the rounded default; a raw function is throw-guarded. */
export function resolveBarPainter(value: BarPainter | undefined): BarPainter {
  if (value) return guard('bar', value, roundedBarFill);

  return roundedBarFill;
}

/** Resolve a candle-painter option. `undefined` uses the rounded default. */
export function resolveCandlePainter(value: CandlePainter | undefined): CandlePainter {
  if (value) return guard('candle', value, roundedCandleFill);

  return roundedCandleFill;
}

/** Resolve a line-painter option. A raw `linePainter` is throw-guarded; a `curve`
 *  name maps to its built-in builder; everything else falls back to straight. */
export function resolveLinePainter(value: 'straight' | 'smooth' | 'stepped' | LinePainter | undefined): LinePainter {
  if (typeof value === 'function') return guard('line', value, straightCurve);

  if (typeof value === 'string') return LINE_CURVES[value] ?? straightCurve;

  return straightCurve;
}
