import type { LineData, OHLCData } from '@wick-charts/react';

export function generateOHLCData(count: number, startPrice = 100, interval = 60): OHLCData[] {
  const data: OHLCData[] = [];
  const now = Math.floor(Date.now() / 1000);
  const startTime = now - count * interval;
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const volatility = 0.005 + Math.random() * 0.01;
    const trend = Math.sin(i / 50) * 0.001;
    const change = (Math.random() - 0.48 + trend) * volatility * price;

    const open = price;
    const close = price + change;
    const highExtra = Math.random() * volatility * price * 0.5;
    const lowExtra = Math.random() * volatility * price * 0.5;
    const high = Math.max(open, close) + highExtra;
    const low = Math.min(open, close) - lowExtra;
    const volume = Math.round(1000 + Math.random() * 50000 + Math.abs(change) * 10000);

    data.push({
      time: startTime + i * interval,
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume,
    });

    price = close;
  }

  return data;
}

/** Generate a volatile indicator line from OHLC data (e.g. Bollinger band) */
export function generateBandLine(ohlc: OHLCData[], offset: number, noiseScale = 0.003): LineData[] {
  return ohlc.map((c, i) => {
    const base = (c.high + c.low) / 2;
    const spread = c.high - c.low;
    const noise = Math.sin(i / 7) * noiseScale * base + (Math.random() - 0.5) * spread * 0.3;
    return { time: c.time, value: round(base + offset * spread * 1.5 + noise) };
  });
}

/** Generate bar chart data (positive/negative values like P&L or delta) */
export function generateBarData(count: number, interval = 60): LineData[] {
  const data: LineData[] = [];
  const now = Math.floor(Date.now() / 1000);
  const startTime = now - count * interval;

  for (let i = 0; i < count; i++) {
    const trend = Math.sin(i / 40) * 0.3;
    const value = round((Math.random() - 0.45 + trend) * 100);
    data.push({ time: startTime + i * interval, value });
  }
  return data;
}

export function generateLineData(count: number, startValue = 100, interval = 60): LineData[] {
  const data: LineData[] = [];
  const now = Math.floor(Date.now() / 1000);
  const startTime = now - count * interval;
  let value = startValue;

  for (let i = 0; i < count; i++) {
    const volatility = 0.003 + Math.random() * 0.007;
    const trend = Math.sin(i / 80) * 0.0015 + Math.cos(i / 30) * 0.0005;
    value += (Math.random() - 0.48 + trend) * volatility * value;
    data.push({ time: startTime + i * interval, value: round(value) });
  }

  return data;
}

/** Generate smooth wave-like data — gentle humps, not random noise */
export function generateWaveData(
  count: number,
  opts: {
    base?: number;
    amplitude?: number;
    /** Primary wave period (in data points) */
    period?: number;
    /** Phase offset (0-1) */
    phase?: number;
    /** When the wave "activates" (0-1 of total count) */
    onset?: number;
    interval?: number;
  } = {},
): LineData[] {
  const { base = 0, amplitude = 100, period = 80, phase = 0, onset = 0, interval = 60 } = opts;

  const data: LineData[] = [];
  const now = Math.floor(Date.now() / 1000);
  const startTime = now - count * interval;

  for (let i = 0; i < count; i++) {
    const t = i / count;
    // Smooth onset envelope
    const onsetFactor = onset > 0 ? Math.max(0, Math.min(1, (t - onset) / 0.15)) : 1;
    // Primary wave
    const wave = Math.sin((i / period + phase) * Math.PI * 2);
    // Secondary harmonic for organic feel
    const harmonic = Math.sin((i / (period * 0.4) + phase * 1.7) * Math.PI * 2) * 0.3;
    // Combine
    const value = base + Math.max(0, (wave + harmonic) * 0.5 + 0.5) * amplitude * onsetFactor;
    data.push({ time: startTime + i * interval, value: round(value) });
  }

  return data;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export class StreamingSource {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastCandle: OHLCData;
  private interval: number;
  private listeners: Array<(candle: OHLCData) => void> = [];

  constructor(lastCandle: OHLCData, interval = 60) {
    this.lastCandle = { ...lastCandle };
    this.interval = interval;
  }

  onTick(listener: (candle: OHLCData) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  start(tickMs = 200): void {
    this.timer = setInterval(() => {
      this.tick();
    }, tickMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    const now = Math.floor(Date.now() / 1000);
    const currentCandleStart = Math.floor(now / this.interval) * this.interval;

    if (currentCandleStart > this.lastCandle.time) {
      // New candle
      const price = this.lastCandle.close;
      this.lastCandle = {
        time: currentCandleStart,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0,
      };
    }

    // Simulate price movement
    const volatility = 0.002;
    const change = (Math.random() - 0.5) * volatility * this.lastCandle.close;
    const newPrice = round(this.lastCandle.close + change);

    this.lastCandle.close = newPrice;
    this.lastCandle.high = Math.max(this.lastCandle.high, newPrice);
    this.lastCandle.low = Math.min(this.lastCandle.low, newPrice);
    this.lastCandle.volume! += Math.round(Math.random() * 100);

    for (const listener of this.listeners) {
      listener({ ...this.lastCandle });
    }
  }
}

export class LineStreamingSource {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastPoint: LineData;
  private interval: number;
  private listeners: Array<(point: LineData) => void> = [];

  constructor(lastPoint: LineData, interval = 60) {
    this.lastPoint = { ...lastPoint };
    this.interval = interval;
  }

  onTick(listener: (point: LineData) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  start(tickMs = 200): void {
    this.timer = setInterval(() => this.tick(), tickMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    const now = Math.floor(Date.now() / 1000);
    const currentStart = Math.floor(now / this.interval) * this.interval;

    if (currentStart > this.lastPoint.time) {
      this.lastPoint = { time: currentStart, value: this.lastPoint.value };
    }

    const volatility = 0.002;
    const change = (Math.random() - 0.5) * volatility * this.lastPoint.value;
    this.lastPoint.value = round(this.lastPoint.value + change);

    for (const listener of this.listeners) {
      listener({ ...this.lastPoint });
    }
  }
}
