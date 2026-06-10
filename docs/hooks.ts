import { useEffect, useRef, useState } from 'react';

import type { OHLCData, TimePoint } from '@wick-charts/react';

import {
  DEMO_INTERVAL,
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
export { useLatestVersion } from './hooks/useLatestVersion';

// ── Streaming hooks ─────────────────────────────────────────

export type LineStreamKind = 'line' | 'bar' | 'layer';

interface BaseStreamOpts {
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
  strategy?: (series: TimePoint[], index: number) => LineStrategy;
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

/**
 * Run streams only while the tab is visible. A hidden tab throttles
 * `setInterval` to ~1Hz (then ~1/min) but never stops it, so the wall-clock
 * catch-up in `BaseStream.tick` keeps spawning bars in the background — wasted
 * CPU, and on the resume frame the viewport snaps forward to absorb the data
 * that piled up while hidden (the visible "gap"). Pausing on `hidden` and
 * resuming on `visible` freezes generation cleanly; `start()` rebaselines its
 * clock on resume so live bars continue with no catch-up burst.
 *
 * `document` is touched here in the hook layer rather than inside `BaseStream`
 * so the stream classes stay DOM-free and their fake-timer unit tests keep
 * working. Returns a cleanup that detaches the listener and stops every stream.
 */
export function runWhileVisible(sources: Array<{ start(): void; stop(): void }>): () => void {
  const sync = () => {
    if (document.visibilityState === 'hidden') {
      for (const s of sources) {
        s.stop();
      }

      return;
    }

    for (const s of sources) {
      s.start();
    }
  };

  sync();
  document.addEventListener('visibilitychange', sync);

  return () => {
    document.removeEventListener('visibilitychange', sync);
    for (const s of sources) {
      s.stop();
    }
  };
}

export function useOHLCStream(allData: OHLCData[], opts: OHLCStreamOpts = {}) {
  const streamInterval = opts.interval ?? DEMO_INTERVAL;
  const { maxPoints } = opts;
  const speedRef = useLiveRef(opts.speed ?? 1);
  const allDataRef = useLiveRef(allData);
  const maxPointsRef = useLiveRef(maxPoints);
  const seriesLength = allData.length;

  const [data, setData] = useState<OHLCData[]>([]);
  const [phase, setPhase] = useState<'loading' | 'live'>('loading');
  const dataRef = useLiveRef(data);

  // Load full history in one shot, immediately on mount. Earlier versions
  // revealed in 50-point batches behind a `startDelay`, but the batches
  // stretched the x-axis with a visible "jump" each, and the delay just made
  // charts appear empty for a beat. The reducer only grows the array (never
  // truncates) so a StrictMode double-mount or an already-started stream
  // can't clobber in-flight live points.
  useEffect(() => {
    const history = allDataRef.current;
    setData((prev) => {
      const target = capArray(history, maxPointsRef.current);
      return prev.length >= target.length ? prev : target;
    });
    setPhase('live');
  }, [seriesLength, allDataRef, maxPointsRef]);

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
    const stopVisibility = runWhileVisible([source]);

    return () => {
      unsub();
      stopVisibility();
    };
  }, [phase, streamInterval, speedRef, allDataRef, maxPointsRef]);

  return { data, phase };
}

function pickLineStrategy(kind: LineStreamKind, series: TimePoint[]): LineStrategy {
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

export function useLineStreams(allData: TimePoint[][], opts: LineStreamOpts = {}) {
  const dataInterval = opts.interval ?? DEMO_INTERVAL;
  const kind: LineStreamKind = opts.kind ?? 'line';
  const { maxPoints } = opts;
  const speedRef = useLiveRef(opts.speed ?? 1);
  const allDataRef = useLiveRef(allData);
  const maxPointsRef = useLiveRef(maxPoints);
  const strategyRef = useLiveRef(opts.strategy);
  const seriesCount = allData.length;
  const historyLength = allData[0]?.length ?? 0;

  const [datasets, setDatasets] = useState<TimePoint[][]>(() => allData.map(() => []));
  const [phase, setPhase] = useState<'loading' | 'live'>('loading');
  const datasetsRef = useLiveRef(datasets);

  // Load full history for every series in one shot, immediately on mount. See
  // `useOHLCStream` above for why the delayed batch-reveal was removed. The
  // reducer still guards against truncation so StrictMode / live-stream races
  // are safe.
  useEffect(() => {
    const history = allDataRef.current;
    setDatasets((prev) =>
      history.map((line, i) => {
        const existing = prev[i] ?? [];
        const target = capArray(line, maxPointsRef.current);
        return existing.length >= target.length ? existing : target;
      }),
    );
    setPhase('live');
  }, [seriesCount, historyLength, allDataRef, maxPointsRef]);

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
    // Fixed tick rate keeps all series in the same chart updating in lockstep;
    // prior per-series random jitter produced visible desync between lines.
    const stopVisibility = runWhileVisible(sources);

    return () => {
      for (const u of unsubs) u();
      stopVisibility();
    };
  }, [phase, dataInterval, kind, seriesCount, allDataRef, speedRef, maxPointsRef, strategyRef]);

  return { datasets, phase };
}

// Re-export strategy builders for callers that need advanced control
export { bandStrategy, barStrategy, layerStrategy, lineDriftStrategy, ohlcStrategy, waveStrategy };
