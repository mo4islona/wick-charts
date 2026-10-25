import type { OHLCData } from '../types';

/** The prices Heikin-Ashi rewrites; `time`, `volume` and any other field carry over. */
type OHLCPrices = Pick<OHLCData, 'open' | 'high' | 'low' | 'close'>;

/**
 * Heikin-Ashi candles for an OHLC series: close is the average of the four
 * prices, open is the midpoint of the previous Heikin-Ashi body (of the
 * candle's own open and close for the first one), and high / low widen to
 * cover both. Pure — returns new candles and leaves `data` untouched.
 *
 * ```tsx
 * const candles = useMemo(() => heikinAshi(raw), [raw]);
 * <CandlestickSeries data={candles} />
 * ```
 */
export function heikinAshi<T extends OHLCPrices>(data: readonly T[]): T[] {
  const result: T[] = [];
  let previous: T | null = null;
  for (const candle of data) {
    const next: T = heikinAshiCandle(candle, previous);
    result.push(next);
    previous = next;
  }

  return result;
}

/** Incremental Heikin-Ashi for a live feed — see {@link heikinAshiStream}. */
export interface HeikinAshiStream<T extends OHLCPrices> {
  /** Replace the source history; returns its Heikin-Ashi series, as {@link heikinAshi} does. */
  setData(data: readonly T[]): T[];
  /** A new source candle; returns its Heikin-Ashi candle for `appendData`. */
  append(candle: T): T;
  /** The newest source candle changed; returns the newest Heikin-Ashi candle again, for `updateData`. */
  update(candle: T): T;
}

/**
 * Stateful Heikin-Ashi for the imperative streaming API: every call is O(1)
 * and returns what {@link heikinAshi} gives for the whole history. Older
 * candles prepended to the source change every later Heikin-Ashi candle, so
 * call `setData` with the full series for them.
 *
 * ```ts
 * const ha = heikinAshiStream<OHLCData>();
 * chart.setSeriesData(id, ha.setData(history));
 * chart.appendData(id, ha.append(newCandle));
 * chart.updateData(id, ha.update(changedCandle));
 * ```
 */
export function heikinAshiStream<T extends OHLCPrices>(): HeikinAshiStream<T> {
  // `update` rebuilds the newest candle from the one before it.
  let beforeLast: T | null = null;
  let last: T | null = null;

  const append = (candle: T): T => {
    beforeLast = last;
    last = heikinAshiCandle(candle, beforeLast);

    return last;
  };

  return {
    setData(data) {
      const result = heikinAshi(data);
      last = result[result.length - 1] ?? null;
      beforeLast = result[result.length - 2] ?? null;

      return result;
    },
    append,
    update(candle) {
      if (last === null) return append(candle);

      last = heikinAshiCandle(candle, beforeLast);

      return last;
    },
  };
}

function heikinAshiCandle<T extends OHLCPrices>(candle: T, previous: OHLCPrices | null): T {
  const close = (candle.open + candle.high + candle.low + candle.close) / 4;
  const open = previous === null ? (candle.open + candle.close) / 2 : (previous.open + previous.close) / 2;

  return {
    ...candle,
    open,
    high: Math.max(candle.high, open, close),
    low: Math.min(candle.low, open, close),
    close,
  };
}
