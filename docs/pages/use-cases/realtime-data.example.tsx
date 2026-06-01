import { useEffect, useRef, useState } from 'react';

import {
  CandlestickSeries,
  ChartContainer,
  type ChartTheme,
  Crosshair,
  type OHLCData,
  Title,
  XAxis,
  YAxis,
} from '@wick-charts/react';

// Ticks a candle keeps forming before it closes and a new one opens. With the
// 600ms timer below that's ~2.4s per bar — slow enough to watch the wick move.
const TICKS_PER_BAR = 4;
// Rolling-window cap — drop the oldest bars so the buffer can't grow forever.
const WINDOW = 120;

// Tiny random walk standing in for a feed. A real app reads this off a socket.
function nextPrice(prev: number): number {
  return prev * (1 + (Math.random() - 0.5) * 0.012);
}

// Declarative streaming: keep the series in React state and hand it to
// <CandlestickSeries data={...}>. The wrapper diffs each new array against the
// previous one and calls appendData / updateData / keepLast under the hood — we
// never touch the chart instance directly.
export function RealtimeDataDemo({ theme, seed }: { theme: ChartTheme; seed: OHLCData[] }) {
  const [data, setData] = useState<OHLCData[]>(seed);
  // Space live bars like the seed so the streamed tail lines up with history.
  const interval = seed.length > 1 ? seed[1].time - seed[0].time : 60_000;
  const ageRef = useRef(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      // A hidden tab throttles timers, then fires a burst on return that snaps
      // the viewport forward. Skip ticks while hidden so the stream stays clean.
      if (document.hidden) return;

      setData((prev) => {
        const last = prev[prev.length - 1];
        const price = nextPrice(last.close);
        ageRef.current += 1;

        // Inside the forming bar → replace the last point in place (same time).
        // The diff routes this to chart.updateData, so the body and wick ease
        // toward the new value instead of a fresh candle popping in.
        if (ageRef.current < TICKS_PER_BAR) {
          const merged: OHLCData = {
            ...last,
            high: Math.max(last.high, price),
            low: Math.min(last.low, price),
            close: price,
            // Build volume up as the bar forms — candles carry `volume`, so the
            // renderer draws the histogram for it; drop it and the bars vanish.
            volume: (last.volume ?? 0) + Math.round(Math.random() * 8000),
          };

          return [...prev.slice(0, -1), merged];
        }

        // Bar closed → open the next one. The new timestamp makes the diff
        // append (chart.appendData); slice caps the rolling window.
        ageRef.current = 0;
        const fresh: OHLCData = {
          time: last.time + interval,
          open: last.close,
          high: price,
          low: price,
          close: price,
          volume: Math.round(5000 + Math.random() * 15000),
        };

        return [...prev, fresh].slice(-WINDOW);
      });
    }, 600);

    return () => window.clearInterval(id);
  }, [interval]);

  return (
    <ChartContainer theme={theme}>
      <Title sub="Live · streaming">BTC/USD</Title>
      <CandlestickSeries id="price" data={data} />
      <Crosshair />
      <YAxis />
      <XAxis />
    </ChartContainer>
  );
}
