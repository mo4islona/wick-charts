// TEMPORARY — showcases the live-tracking smoothing effect in an amped-up
// regime where the difference between smoothMs=0 and >0 is obvious.
// Remove once we decide whether to keep/expose the feature.

import { useEffect, useMemo, useState } from 'react';

import {
  CandlestickSeries,
  ChartContainer,
  type ChartTheme,
  Crosshair,
  type OHLCData,
  Title,
  XAxis,
  YAxis,
  YLabel,
} from '@wick-charts/react';

import { Cell } from '../components/Cell';
import { type OHLCStrategy, OHLCStream, generateOHLCData } from '../data';

const HISTORY = 80;
const INTERVAL = 5_000;
const START_PRICE = 100;

// Moderately amplified: intra jumps by ±0.25% (vs default 0.1%) — enough to
// make smoothing visible without turning the chart into a spike festival.
function amplifiedOhlcStrategy(startPrice: number): OHLCStrategy {
  const round = (n: number): number => Math.round(n * 100) / 100;
  return {
    boundary: ({ prev, time }) => {
      const price = prev?.close ?? startPrice;
      const change = (Math.random() - 0.5) * 0.004 * price;
      const open = price;
      const close = round(price + change);
      const high = round(Math.max(open, close) + Math.random() * 0.002 * price);
      const low = round(Math.min(open, close) - Math.random() * 0.002 * price);
      return { time, open: round(open), high, low, close };
    },
    intra: ({ prev, time }) => {
      if (!prev) throw new Error('intra requires prev');
      const change = (Math.random() - 0.5) * 0.005 * prev.close;
      const close = round(prev.close + change);
      return {
        time,
        open: prev.open,
        high: Math.max(prev.high, close),
        low: Math.min(prev.low, close),
        close,
      };
    },
  };
}

function Panel({
  theme,
  data,
  smoothMs,
  title,
  sub,
}: {
  theme: ChartTheme;
  data: OHLCData[];
  smoothMs: number;
  title: string;
  sub: string;
}) {
  return (
    <Cell theme={theme} style={{ flex: 1, minHeight: 0 }}>
      <ChartContainer theme={theme}>
        <Title sub={sub}>{title}</Title>
        <CandlestickSeries
          id="candle"
          data={data}
          options={{
            smoothMs,
          }}
        />
        <YLabel seriesId="candle" />
        <Crosshair />
        <YAxis />
        <XAxis />
      </ChartContainer>
    </Cell>
  );
}

export function LiveTrackingPage({ theme }: { theme: ChartTheme }) {
  const history = useMemo(() => generateOHLCData(HISTORY, START_PRICE, INTERVAL), []);
  const [data, setData] = useState<OHLCData[]>(history);

  useEffect(() => {
    const last = history[history.length - 1];
    const source = new OHLCStream({
      last,
      startIndex: history.length - 1,
      interval: INTERVAL,
      strategy: amplifiedOhlcStrategy(last.close),
      // speed=2: candle advances every ~2.5s (interval 5s ÷ speed) so each
      // gets ~5 intra ticks (INTRA_EMIT_MS=500). Higher speeds reset
      // `lastIntraEmit` too often and intras barely fire.
      speed: () => 2,
    });

    const unsub = source.onTick((candle) => {
      setData((prev) => {
        const tail = prev[prev.length - 1];
        if (tail && tail.time === candle.time) {
          return [...prev.slice(0, -1), candle];
        }
        return [...prev, candle];
      });
    });

    source.start(100);
    return () => {
      unsub();
      source.stop();
    };
  }, [history]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 8,
        height: '100%',
        minHeight: 0,
        color: theme.tooltip.textColor,
      }}
    >
      <div
        style={{
          fontSize: theme.typography.fontSize,
          opacity: 0.75,
          lineHeight: 1.5,
        }}
      >
        Same synthetic feed (~±0.25% per intra tick, 2 Hz) rendered twice. Left is raw — each tick snaps the last
        candle. Right smooths at <code>smoothMs=500</code> (500 ms time-constant) so the body slides instead of jumping.
        Watch the last candle.
      </div>
      <div
        style={{
          display: 'flex',
          gap: 8,
          flex: 1,
          minHeight: 0,
        }}
      >
        <Panel theme={theme} data={data} smoothMs={0} title="Off (snap)" sub="smoothMs: 0" />
        <Panel theme={theme} data={data} smoothMs={500} title="On (smooth)" sub="smoothMs: 500" />
      </div>
    </div>
  );
}
