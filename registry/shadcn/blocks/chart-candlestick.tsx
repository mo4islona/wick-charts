'use client';

import { useEffect, useState } from 'react';

import {
  CandlestickSeries,
  Crosshair,
  InfoBar,
  NumberFlow,
  type OHLCData,
  TimeAxis,
  YAxis,
  YLabel,
} from '@wick-charts/react';

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WickChart } from '@/components/ui/wick-chart';

const CANDLE_MS = 5000;
const TICK_MS = 500;
const HISTORY = 80;

const formatPrice = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Inside the chart: the same grouping without cents, so the axis column and the OHLC row fit a phone.
const formatChartPrice = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 0 });

const candleOptions = { bodyWidthRatio: 0.7 };

// Seeded, so the server render and the browser start from the same candles.
function seededRandom(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

    return state / 4_294_967_296;
  };
}

// Demo feed: each tick moves the last candle, a new candle opens every 5 s.
function openCandle(time: number, price: number): OHLCData {
  return { time, open: price, high: price, low: price, close: price };
}

function tradeInto(candle: OHLCData, random: () => number = Math.random): OHLCData {
  const close = candle.close * (1 + (random() - 0.5) * 0.002);

  return { ...candle, close, high: Math.max(candle.high, close), low: Math.min(candle.low, close) };
}

function seedCandles(): OHLCData[] {
  const start = Math.floor(Date.now() / CANDLE_MS) * CANDLE_MS - HISTORY * CANDLE_MS;
  const candles: OHLCData[] = [];
  const random = seededRandom(7);
  let price = 68_000;

  for (let i = 0; i < HISTORY; i++) {
    let candle = openCandle(start + i * CANDLE_MS, price);
    for (let trade = 0; trade < CANDLE_MS / TICK_MS; trade++) {
      candle = tradeInto(candle, random);
    }

    candles.push(candle);
    price = candle.close;
  }

  return candles;
}

export function ChartCandlestick() {
  const [candles, setCandles] = useState(seedCandles);

  useEffect(() => {
    const timer = setInterval(() => {
      setCandles((previous) => {
        const last = previous[previous.length - 1];
        const isNewCandle = Date.now() >= last.time + CANDLE_MS;
        if (isNewCandle) {
          return [...previous.slice(1), tradeInto(openCandle(last.time + CANDLE_MS, last.close))];
        }

        return [...previous.slice(0, -1), tradeInto(last)];
      });
    }, TICK_MS);

    return () => clearInterval(timer);
  }, []);

  const first = candles[0].open;
  const latest = candles[candles.length - 1].close;
  const change = ((latest - first) / first) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle>BTC / USD</CardTitle>
        <CardDescription>5-second candles, simulated feed</CardDescription>
        <CardAction className="text-right">
          <NumberFlow value={latest} format={formatPrice} className="text-2xl font-semibold tabular-nums" />
          <div
            className={
              change >= 0 ? 'text-xs text-emerald-600 dark:text-emerald-400' : 'text-xs text-red-600 dark:text-red-400'
            }
          >
            {change >= 0 ? '+' : ''}
            {change.toFixed(2)}%
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        <WickChart className="aspect-auto h-[280px]" viewport={{ initialRange: 48 }}>
          <InfoBar format={formatChartPrice} />
          <CandlestickSeries data={{ label: 'BTC', data: candles }} options={candleOptions} />
          <YAxis format={formatChartPrice} />
          <TimeAxis />
          <Crosshair />
          <YLabel />
        </WickChart>
      </CardContent>
    </Card>
  );
}
