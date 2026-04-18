import { useEffect, useRef, useState } from 'react';

import type { LineData, OHLCData } from '@wick-charts/react';

import {
  type LineStrategy,
  LineStream,
  OHLCStream,
  bandStrategy,
  barStrategy,
  layerStrategy,
  lineDriftStrategy,
  ohlcStrategy,
  waveStrategy,
} from './data';

// Re-exports for convenience
export { type Framework, useFramework } from './context/framework';
export { useIsMobile } from './hooks/useIsMobile';

// ── Streaming hooks ─────────────────────────────────────────

const BATCH_SIZE = 50;
const BATCH_DELAY = 600;

export type LineStreamKind = 'line' | 'bar' | 'layer';

interface BaseStreamOpts {
  delay?: number;
  interval?: number;
  /** 1 = realtime; 2 = 2× faster new bars; 0.5 = half speed. Read live from a ref. */
  speed?: number;
  /** Keep only the most recent N points per series (default: unbounded). */
  maxPoints?: number;
}

export type OHLCStreamOpts = BaseStreamOpts;
export interface LineStreamOpts extends BaseStreamOpts {
  /** Shorthand picker for a built-in strategy (drift / bar / layer). */
  kind?: LineStreamKind;
  /** Per-series strategy factory. Takes precedence over `kind`; lets callers
   * continue specialised generators (wave, band) with their original shape. */
  strategy?: (series: LineData[], index: number) => LineStrategy;
}

function useLiveRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

function capArray<T>(arr: T[], max?: number): T[] {
  if (!max || arr.length <= max) return arr;
  return arr.slice(arr.length - max);
}

export function useOHLCStream(allData: OHLCData[], opts: OHLCStreamOpts = {}) {
  const delay = opts.delay ?? 50;
  const streamInterval = opts.interval ?? 60;
  const { maxPoints } = opts;
  const speedRef = useLiveRef(opts.speed ?? 1);
  const allDataRef = useLiveRef(allData);
  const maxPointsRef = useLiveRef(maxPoints);
  const seriesLength = allData.length;

  const [data, setData] = useState<OHLCData[]>([]);
  const [phase, setPhase] = useState<'loading' | 'live'>('loading');
  const dataRef = useLiveRef(data);

  // Batch-reveal historical data. The reducer only grows the array, so
  // StrictMode re-runs and streaming emissions can't truncate it.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const history = allDataRef.current;
    const total = Math.ceil(history.length / BATCH_SIZE);
    let batch = 0;
    const loadNext = () => {
      if (cancelled) return;
      batch++;
      const end = batch * BATCH_SIZE;
      setData((prev) => {
        const slice = history.slice(0, end);
        return prev.length >= slice.length ? prev : capArray(slice, maxPointsRef.current);
      });
      if (batch < total) timer = setTimeout(loadNext, BATCH_DELAY);
      else setPhase('live');
    };
    timer = setTimeout(loadNext, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [delay, seriesLength, allDataRef, maxPointsRef]);

  useEffect(() => {
    if (phase !== 'live') return;
    const history = allDataRef.current;
    const current = dataRef.current;
    // Resume from the latest emitted point (or historical tail on first mount)
    // so a StrictMode re-run doesn't insert bars behind already-streamed ones.
    const last = current[current.length - 1] ?? history[history.length - 1];
    if (!last) return;
    // Derive `startIndex` from `last.time` so the sampler's phase (sine
    // trends, etc.) stays continuous across a resume — without this, a
    // remount that inherits streamed tail would reset the sampler index
    // back to `history.length - 1` and reintroduce a visible seam.
    const baseTime = history[0]?.time ?? last.time;
    const startIndex =
      streamInterval > 0 ? Math.max(0, Math.round((last.time - baseTime) / streamInterval)) : history.length - 1;
    const source = new OHLCStream({
      last,
      startIndex,
      interval: streamInterval,
      strategy: ohlcStrategy(history[0]?.close ?? 100),
      speed: () => speedRef.current,
    });
    const unsub = source.onTick((candle) => {
      setData((prev) => {
        const tail = prev[prev.length - 1];
        const next = tail && tail.time === candle.time ? [...prev.slice(0, -1), candle] : [...prev, candle];
        return capArray(next, maxPointsRef.current);
      });
    });
    source.start(500);
    return () => {
      unsub();
      source.stop();
    };
  }, [phase, streamInterval, speedRef, allDataRef, maxPointsRef]);

  return { data, phase };
}

function pickLineStrategy(kind: LineStreamKind, series: LineData[]): LineStrategy {
  switch (kind) {
    case 'bar': {
      const amplitude = Math.max(100, ...series.map((p) => Math.abs(p.value))) * 1.2;
      return barStrategy(amplitude);
    }
    case 'layer': {
      const base = series.length > 0 ? series.reduce((s, p) => s + p.value, 0) / series.length / 1.4 : 50;
      return layerStrategy(base);
    }
    default:
      return lineDriftStrategy(series[series.length - 1]?.value ?? 100);
  }
}

export function useLineStreams(allData: LineData[][], opts: LineStreamOpts = {}) {
  const delay = opts.delay ?? 50;
  const dataInterval = opts.interval ?? 60;
  const kind: LineStreamKind = opts.kind ?? 'line';
  const { maxPoints } = opts;
  const speedRef = useLiveRef(opts.speed ?? 1);
  const allDataRef = useLiveRef(allData);
  const maxPointsRef = useLiveRef(maxPoints);
  const strategyRef = useLiveRef(opts.strategy);
  const seriesCount = allData.length;
  const historyLength = allData[0]?.length ?? 0;

  const [datasets, setDatasets] = useState<LineData[][]>(() => allData.map(() => []));
  const [phase, setPhase] = useState<'loading' | 'live'>('loading');
  const datasetsRef = useLiveRef(datasets);

  // Batch-reveal historical data. The reducer only grows each series, so
  // StrictMode re-runs and streaming emissions can't truncate.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const history = allDataRef.current;
    const total = Math.ceil(historyLength / BATCH_SIZE);
    let batch = 0;
    const loadNext = () => {
      if (cancelled) return;
      batch++;
      const end = batch * BATCH_SIZE;
      setDatasets((prev) =>
        history.map((line, i) => {
          const existing = prev[i] ?? [];
          const slice = line.slice(0, end);
          return existing.length >= slice.length ? existing : capArray(slice, maxPointsRef.current);
        }),
      );
      if (batch < total) timer = setTimeout(loadNext, BATCH_DELAY);
      else setPhase('live');
    };
    timer = setTimeout(loadNext, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [delay, seriesCount, historyLength, allDataRef, maxPointsRef]);

  useEffect(() => {
    if (phase !== 'live') return;
    const history = allDataRef.current;
    const current = datasetsRef.current;
    const strategyFactory = strategyRef.current;
    const sources = history.map((line, i) => {
      const existing = current[i] ?? [];
      // Resume from the latest emitted point when remounting (StrictMode),
      // otherwise fall back to the historical tail on first live start.
      const last = existing[existing.length - 1] ?? line[line.length - 1];
      // Derive `startIndex` from `last.time` so the sampler's phase (sine
      // trends, wave continuation, etc.) stays continuous across a resume.
      const baseTime = line[0]?.time ?? last.time;
      const startIndex =
        dataInterval > 0 ? Math.max(0, Math.round((last.time - baseTime) / dataInterval)) : line.length - 1;
      return new LineStream({
        last,
        startIndex,
        interval: dataInterval,
        strategy: strategyFactory ? strategyFactory(line, i) : pickLineStrategy(kind, line),
        speed: () => speedRef.current,
      });
    });
    const unsubs = sources.map((source, i) =>
      source.onTick((point) => {
        setDatasets((prev) => {
          const next = [...prev];
          const arr = prev[i] ?? [];
          const tail = arr[arr.length - 1];
          const merged = tail && tail.time === point.time ? [...arr.slice(0, -1), point] : [...arr, point];
          next[i] = capArray(merged, maxPointsRef.current);
          return next;
        });
      }),
    );
    for (const s of sources) s.start(400 + Math.random() * 200);
    return () => {
      for (const u of unsubs) u();
      for (const s of sources) s.stop();
    };
  }, [phase, dataInterval, kind, seriesCount, allDataRef, speedRef, maxPointsRef, strategyRef]);

  return { datasets, phase };
}

// Re-export strategy builders for callers that need advanced control
export { bandStrategy, barStrategy, layerStrategy, lineDriftStrategy, ohlcStrategy, waveStrategy };
