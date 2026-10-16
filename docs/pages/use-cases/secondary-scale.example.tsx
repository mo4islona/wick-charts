import { useMemo } from 'react';

import {
  ChartContainer,
  type ChartTheme,
  Crosshair,
  LineSeries,
  ReferenceLine,
  TimeAxis,
  type TimePoint,
  Tooltip,
  YAxis,
  YLabel,
} from '@wick-charts/react';

const INTERVAL = 60_000; // one sample per minute
const COUNT = 120;
const RSI_PERIOD = 14;
// Fixed epoch so the synthetic series is identical at build (prerender) and run time.
const START = 1_700_000_000_000;

// Stable outside the component: a fresh `scales` object would refit on every render.
const SCALES = { rsi: { position: 'left' as const, min: 0, max: 100 } };

// Deterministic price walk — a few incommensurate sines, no Math.random, so
// prerender and hydration draw the same series.
function priceAt(i: number): number {
  return 64_000 + Math.sin(i * 0.11) * 900 + Math.sin(i * 0.37 + 1.3) * 350 + Math.sin(i * 1.7) * 90;
}

/** Wilder's RSI over the closes — the first `RSI_PERIOD` samples have no value yet. */
function rsiOf(prices: TimePoint[]): TimePoint[] {
  const result: TimePoint[] = [];
  let gain = 0;
  let loss = 0;

  for (let i = 1; i < prices.length; i++) {
    const change = prices[i].value - prices[i - 1].value;
    const up = Math.max(change, 0);
    const down = Math.max(-change, 0);

    if (i <= RSI_PERIOD) {
      gain += up / RSI_PERIOD;
      loss += down / RSI_PERIOD;
      if (i < RSI_PERIOD) continue;
    } else {
      gain = (gain * (RSI_PERIOD - 1) + up) / RSI_PERIOD;
      loss = (loss * (RSI_PERIOD - 1) + down) / RSI_PERIOD;
    }

    const value = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    result.push({ time: prices[i].time, value });
  }

  return result;
}

export function SecondaryScaleDemo({ theme }: { theme: ChartTheme }) {
  const price = useMemo(
    () => Array.from({ length: COUNT }, (_, i) => ({ time: START + i * INTERVAL, value: priceAt(i) })),
    [],
  );
  const rsi = useMemo(() => rsiOf(price), [price]);

  return (
    <ChartContainer theme={theme} scales={SCALES}>
      <LineSeries id="price" data={[{ label: 'BTC/USD', data: price }]} />
      <LineSeries
        id="rsi"
        scale="rsi"
        data={[{ label: 'RSI 14', color: '#cba6f7', data: rsi }]}
        options={{ area: { visible: false } }}
      />
      <ReferenceLine value={70} scale="rsi" label="overbought" color="#f0556a" />
      <ReferenceLine value={30} scale="rsi" label="oversold" color="#3fb98a" />
      <YAxis />
      <YAxis scale="rsi" format={(v) => v.toFixed(0)} />
      <YLabel seriesId="price" />
      <YLabel seriesId="rsi" color="#cba6f7" />
      <TimeAxis />
      <Crosshair />
      <Tooltip />
    </ChartContainer>
  );
}
