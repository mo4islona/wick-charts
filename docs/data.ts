import type { LineData, OHLCData } from '@wick-charts/react';

// ── Sampler protocol ─────────────────────────────────────────
//
// A sampler is a pure function that returns the next point given an index,
// a boundary timestamp, and the previous point. Historical data generators
// and live streaming sources share the same samplers, so live data looks
// statistically identical to history.
//
// `boundary` — emitted once per interval (a new bar / candle).
// `intra`    — emitted on each tick within the current bar (optional,
//              used for "still forming" effects on candles and drift lines).

export interface SamplerCtx<T> {
  index: number;
  time: number;
  prev: T | null;
}

export type LineSampler = (ctx: SamplerCtx<LineData>) => LineData;
export type OHLCSampler = (ctx: SamplerCtx<OHLCData>) => OHLCData;

export interface LineStrategy {
  boundary: LineSampler;
  intra?: LineSampler;
}

export interface OHLCStrategy {
  boundary: OHLCSampler;
  intra?: OHLCSampler;
}

const round = (n: number): number => Math.round(n * 100) / 100;

// ── OHLC strategy ────────────────────────────────────────────

export function ohlcStrategy(startPrice: number): OHLCStrategy {
  return {
    boundary: ({ index, time, prev }) => {
      const price = prev?.close ?? startPrice;
      const volatility = 0.005 + Math.random() * 0.01;
      const trend = Math.sin(index / 50) * 0.001;
      const change = (Math.random() - 0.48 + trend) * volatility * price;
      const open = price;
      const close = price + change;
      const highExtra = Math.random() * volatility * price * 0.5;
      const lowExtra = Math.random() * volatility * price * 0.5;
      const high = Math.max(open, close) + highExtra;
      const low = Math.min(open, close) - lowExtra;
      const volume = Math.round(1000 + Math.random() * 50000 + Math.abs(change) * 10000);
      return { time, open: round(open), high: round(high), low: round(low), close: round(close), volume };
    },
    intra: ({ time, prev }) => {
      if (!prev) throw new Error('ohlc intra sampler requires prev');
      const change = (Math.random() - 0.5) * 0.002 * prev.close;
      const close = round(prev.close + change);
      return {
        time,
        open: prev.open,
        high: Math.max(prev.high, close),
        low: Math.min(prev.low, close),
        close,
        volume: (prev.volume ?? 0) + Math.round(Math.random() * 100),
      };
    },
  };
}

// ── Line drift strategy (accumulating random walk) ──────────

export function lineDriftStrategy(startValue: number): LineStrategy {
  return {
    boundary: ({ index, time, prev }) => {
      const base = prev?.value ?? startValue;
      const volatility = 0.003 + Math.random() * 0.007;
      const trend = Math.sin(index / 80) * 0.0015 + Math.cos(index / 30) * 0.0005;
      const value = base + (Math.random() - 0.48 + trend) * volatility * base;
      return { time, value: round(value) };
    },
    intra: ({ time, prev }) => {
      if (!prev) throw new Error('line intra sampler requires prev');
      const change = (Math.random() - 0.5) * 0.002 * prev.value;
      return { time, value: round(prev.value + change) };
    },
  };
}

// ── Bar strategy (independent samples with sine trend) ──────

export function barStrategy(amplitude = 100): LineStrategy {
  return {
    boundary: ({ index, time }) => {
      const trend = Math.sin(index / 40) * 0.3;
      return { time, value: round((Math.random() - 0.45 + trend) * amplitude) };
    },
  };
}

// ── Layer strategy (always-positive jitter around a base) ──

export function layerStrategy(base: number): LineStrategy {
  return {
    boundary: ({ time }) => ({ time, value: Math.round(base + Math.random() * base * 0.8) }),
  };
}

// ── Wave strategy (deterministic smooth wave) ──────────────

export interface WaveOpts {
  base?: number;
  amplitude?: number;
  period?: number;
  phase?: number;
  onset?: number;
  /** Normalizer for the onset envelope. Defaults to the historical count. */
  totalHint?: number;
}

export function waveStrategy(opts: WaveOpts = {}): LineStrategy {
  const { base = 0, amplitude = 100, period = 80, phase = 0, onset = 0, totalHint = 300 } = opts;
  return {
    boundary: ({ index, time }) => {
      const t = totalHint > 0 ? index / totalHint : 0;
      const onsetFactor = onset > 0 ? Math.max(0, Math.min(1, (t - onset) / 0.15)) : 1;
      const wave = Math.sin((index / period + phase) * Math.PI * 2);
      const harmonic = Math.sin((index / (period * 0.4) + phase * 1.7) * Math.PI * 2) * 0.3;
      const value = base + Math.max(0, (wave + harmonic) * 0.5 + 0.5) * amplitude * onsetFactor;
      return { time, value: round(value) };
    },
  };
}

// ── Band strategy (derived from OHLC) ─────────────────────

export function bandStrategy(ohlc: OHLCData[], offset: number, noiseScale = 0.003): LineStrategy {
  return {
    boundary: ({ index, time }) => {
      const c = ohlc[index] ?? ohlc[ohlc.length - 1];
      const base = (c.high + c.low) / 2;
      const spread = c.high - c.low;
      const noise = Math.sin(index / 7) * noiseScale * base + (Math.random() - 0.5) * spread * 0.3;
      return { time, value: round(base + offset * spread * 1.5 + noise) };
    },
  };
}

// ── Historical generators (walk the sampler N times) ──────

function walkLine(count: number, interval: number, strategy: LineStrategy): LineData[] {
  const now = Math.floor(Date.now() / interval) * interval;
  const startTime = now - count * interval;
  const out: LineData[] = [];
  let prev: LineData | null = null;
  for (let i = 0; i < count; i++) {
    const next = strategy.boundary({ index: i, time: startTime + i * interval, prev });
    out.push(next);
    prev = next;
  }
  return out;
}

function walkOHLC(count: number, interval: number, strategy: OHLCStrategy): OHLCData[] {
  const now = Math.floor(Date.now() / interval) * interval;
  const startTime = now - count * interval;
  const out: OHLCData[] = [];
  let prev: OHLCData | null = null;
  for (let i = 0; i < count; i++) {
    const next = strategy.boundary({ index: i, time: startTime + i * interval, prev });
    out.push(next);
    prev = next;
  }
  return out;
}

export function generateOHLCData(count: number, startPrice = 100, interval = 60_000): OHLCData[] {
  return walkOHLC(count, interval, ohlcStrategy(startPrice));
}

export function generateLineData(count: number, startValue = 100, interval = 60_000): LineData[] {
  return walkLine(count, interval, lineDriftStrategy(startValue));
}

export function generateBarData(count: number, interval = 60_000): LineData[] {
  return walkLine(count, interval, barStrategy(100));
}

export function generateLayerData(count: number, base: number, interval = 60_000): LineData[] {
  return walkLine(count, interval, layerStrategy(base));
}

export function generateWaveData(count: number, opts: WaveOpts & { interval?: number } = {}): LineData[] {
  const { interval = 60_000, ...rest } = opts;
  return walkLine(count, interval, waveStrategy({ ...rest, totalHint: rest.totalHint ?? count }));
}

export function generateBandLine(ohlc: OHLCData[], offset: number, noiseScale = 0.003): LineData[] {
  const interval = ohlc.length > 1 ? (ohlc[1].time as number) - (ohlc[0].time as number) : 60_000;
  return walkLine(ohlc.length, interval, bandStrategy(ohlc, offset, noiseScale));
}

// ── Streaming sources ─────────────────────────────────────
//
// Both sources share the same control logic:
//  - a *virtual* clock advances at `speed() * realDt`, so raising speed
//    makes new bars appear faster without changing their time spacing;
//  - boundary sampler fires whenever the virtual clock crosses the next
//    `interval` step, advancing `index` and emitting a fresh point;
//  - intra sampler (if any) fires on every tick to refresh the in-progress
//    bar/candle, giving the "still forming" effect.

export interface StreamConfig<T, S> {
  last: T;
  startIndex: number;
  interval: number;
  strategy: S;
  /** Getter so the slider can update speed live without restarting the source. */
  speed?: () => number;
}

type AnyStrategy<T> = {
  boundary: (ctx: SamplerCtx<T>) => T;
  intra?: (ctx: SamplerCtx<T>) => T;
};

class BaseStream<T extends { time: number }, S extends AnyStrategy<T>> {
  protected timer: ReturnType<typeof setInterval> | null = null;
  protected last: T;
  protected index: number;
  protected readonly interval: number;
  protected readonly strategy: S;
  protected readonly speed: () => number;
  protected virtualNow: number;
  protected lastReal = 0;
  protected listeners: Array<(point: T) => void> = [];

  constructor(cfg: StreamConfig<T, S>) {
    this.last = { ...cfg.last };
    this.index = cfg.startIndex;
    this.interval = cfg.interval;
    this.strategy = cfg.strategy;
    this.speed = cfg.speed ?? (() => 1);
    // Anchor the virtual clock at whichever is later: the current wall-clock
    // boundary, or the already-emitted tail. Without the max(), resuming a
    // stream that had run at speed > 1 would leave virtualNow behind last.time
    // and the while-loop in tick() would stall until real time caught up.
    this.virtualNow = Math.max(Math.floor(Date.now() / cfg.interval) * cfg.interval, cfg.last.time);
  }

  onTick(listener: (point: T) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  start(tickMs = 200): void {
    this.lastReal = Date.now();
    this.timer = setInterval(() => this.tick(), tickMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  protected emit(point: T): void {
    for (const l of this.listeners) l({ ...point });
  }

  protected tick(): void {
    const realNow = Date.now();
    const dt = realNow - this.lastReal;
    this.lastReal = realNow;
    this.virtualNow += dt * this.speed();

    const boundary = Math.floor(this.virtualNow / this.interval) * this.interval;
    while (boundary > this.last.time) {
      this.index++;
      const time = this.last.time + this.interval;
      this.last = this.strategy.boundary({ index: this.index, time, prev: this.last });
      this.emit(this.last);
    }

    if (this.strategy.intra) {
      this.last = this.strategy.intra({ index: this.index, time: this.last.time, prev: this.last });
      this.emit(this.last);
    }
  }
}

export class LineStream extends BaseStream<LineData, LineStrategy> {}
export class OHLCStream extends BaseStream<OHLCData, OHLCStrategy> {}

// ── Legacy aliases ────────────────────────────────────────

export const StreamingSource = OHLCStream;
export const LineStreamingSource = LineStream;
