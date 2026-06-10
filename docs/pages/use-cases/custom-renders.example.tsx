import { useEffect, useMemo, useRef, useState } from 'react';

import {
  type CandlePainter,
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

// A custom candle-body painter: the engine still computes each brick's rect from
// the (open, close) we feed it; this just owns the fill. Insetting the body by a
// device pixel on every side turns the touching bodies into a clean brick wall —
// the chart background reads through as the mortar. No library change, no
// registration — a plain function handed straight to `candlePainter`. Hoisting it
// to module scope keeps the reference stable, so the wrapper diffs it cleanly.
const renkoBrick: CandlePainter = (env, args) => {
  const { ctx, horizontalPixelRatio, verticalPixelRatio } = env;
  const { geom, color } = args;

  const x = geom.x + horizontalPixelRatio;
  const y = geom.y + verticalPixelRatio;
  const width = Math.max(1, geom.width - horizontalPixelRatio * 2);
  const height = Math.max(1, geom.height - verticalPixelRatio * 2);

  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
};

/** Theme body colors can be a `[top, bottom]` gradient tuple; renko bricks are
 *  flat, so collapse to the top stop. */
function flatColor(body: string | [string, string]): string {
  return Array.isArray(body) ? body[0] : body;
}

/** A box size derived from the close-price span so the demo stays legible
 *  whatever the random walk produces — ~40 boxes across the full range, floored
 *  at 0.5 and snapped to the nearest half. Frozen once from the seed so live
 *  ticks extend the same brick grid instead of reshuffling the existing bricks. */
function boxSizeFor(candles: OHLCData[]): number {
  if (candles.length === 0) return 1;

  let min = candles[0].close;
  let max = candles[0].close;
  for (const candle of candles) {
    if (candle.close < min) min = candle.close;
    if (candle.close > max) max = candle.close;
  }

  const raw = (max - min) / 40;

  return Math.max(0.5, Math.round(raw * 2) / 2);
}

interface RenkoGrid {
  boxSize: number;
  interval: number;
  startTime: number;
}

/**
 * Classic close-based renko. Walk the close prices and emit a fixed-size brick
 * every time price clears a full box past the most recent brick; a reversal
 * needs two boxes against the trend (one box already sits in the other
 * direction). A strong move stacks several bricks on one close, a quiet stretch
 * none. Time is discarded — each brick takes the next equally-spaced slot.
 *
 * Pure and deterministic: the same closes on the same box grid always produce
 * the same bricks. That's what lets the streaming demo below re-run it on every
 * tick and hand the result straight to the `data` prop — the bricks it already
 * drew come back identical (diffed as no-ops) and only a freshly cleared box
 * appends a new one.
 */
function toRenko(closes: number[], grid: RenkoGrid): OHLCData[] {
  const { boxSize, interval, startTime } = grid;
  const bricks: OHLCData[] = [];
  if (closes.length === 0 || boxSize <= 0) return bricks;

  // `top` / `bottom` track the price edges of the most recent brick.
  let top = Math.round(closes[0] / boxSize) * boxSize;
  let bottom = top;
  let col = 0;

  const pushBrick = (open: number, close: number) => {
    bricks.push({
      time: startTime + col * interval,
      open,
      high: Math.max(open, close),
      low: Math.min(open, close),
      close,
    });
    col += 1;
  };

  for (const price of closes) {
    while (price >= top + boxSize) {
      pushBrick(top, top + boxSize);
      bottom = top;
      top += boxSize;
    }

    while (price <= bottom - boxSize) {
      pushBrick(bottom, bottom - boxSize);
      top = bottom;
      bottom -= boxSize;
    }
  }

  return bricks;
}

// How often a fresh tick arrives, and the rolling-window cap on rendered bricks
// so the buffer can't grow without bound.
const TICK_MS = 600;
const WINDOW = 120;

/**
 * Renko via a custom painter, streamed live. Three independent pieces compose:
 * the painter (`renkoBrick`) owns the pixels, the data is an ordinary `toRenko`
 * transform, and streaming is the same `data`-prop diff every series uses.
 *
 * The point of the live version: owning the pixels does NOT opt you out of live
 * updates. The painter has no coupling to where bars come from — it just runs
 * every frame on whatever bricks exist, so a freshly cleared brick fades in with
 * the same entrance animation it would get on any other series.
 */
export function CustomRendersDemo({ theme, seed }: { theme: ChartTheme; seed: OHLCData[] }) {
  // Box grid frozen from the seed. A stable box size + start time is what keeps
  // streaming append-only: a new close can clear the next box and add a brick,
  // but it can never move the price edges of the bricks already on screen.
  const grid = useMemo<RenkoGrid>(
    () => ({
      boxSize: boxSizeFor(seed),
      interval: seed.length > 1 ? seed[1].time - seed[0].time : 60_000,
      startTime: seed[0]?.time ?? 0,
    }),
    [seed],
  );

  // The full close-price history. We keep the closes (not the bricks) and
  // re-derive on each tick — `toRenko` is cheap and deterministic, so the
  // earlier bricks come back identical and only newly cleared boxes append.
  const closesRef = useRef<number[]>(seed.map((candle) => candle.close));
  const seedBricks = useMemo(() => toRenko(closesRef.current, grid), [grid]);
  const brickCountRef = useRef(seedBricks.length);
  const [bricks, setBricks] = useState<OHLCData[]>(() => seedBricks.slice(-WINDOW));

  useEffect(() => {
    // A trending random walk stands in for a price feed (a real app reads it off
    // a socket). The small, mean-reverting `velocity` makes price move in runs
    // that clear boxes steadily — a pure i.i.d. walk mostly dithers inside one
    // box, so bricks (and the whole point of the demo) would barely appear.
    let velocity = 0;

    const id = window.setInterval(() => {
      // A hidden tab throttles timers, then fires a burst on return that would
      // snap the viewport forward. Skip ticks while hidden so the stream stays
      // clean and the close history stays bounded.
      if (document.hidden) return;

      velocity = velocity * 0.8 + (Math.random() - 0.5) * 0.012;
      const closes = closesRef.current;
      closes.push(closes[closes.length - 1] * (1 + velocity));

      // Re-derive from the full history. A quiet stretch clears no box, so the
      // brick count is unchanged and there is nothing to push to the chart.
      const next = toRenko(closes, grid);
      if (next.length === brickCountRef.current) return;

      // A box cleared → one (or a few) new bricks. Hand the rolling window to
      // the `data` prop; the wrapper diffs it, appends the fresh bricks, and the
      // painter fades them in. No imperative call, no chart-instance handle.
      brickCountRef.current = next.length;
      setBricks(next.slice(-WINDOW));
    }, TICK_MS);

    return () => window.clearInterval(id);
  }, [grid]);

  const up = flatColor(theme.candlestick.up.body);
  const down = flatColor(theme.candlestick.down.body);

  return (
    <ChartContainer theme={theme}>
      <Title sub="Renko · live · custom candle painter">BTC/USD</Title>
      <CandlestickSeries
        id="renko"
        data={bricks}
        options={{
          up: { body: up, wick: up },
          down: { body: down, wick: down },
          // The painter owns the fill, but the engine still owns layout — so
          // bodyWidthRatio is what sizes the rect (geom.width) handed to
          // renkoBrick. Default 0.6 → a 60%-wide rect, so even a perfect brick
          // fill leaves column gaps; 1 → full-width rects that touch, and the
          // painter's 1px inset is the mortar. (No cornerRadius needed: with a
          // painter the engine just hands over the rect and fillRect is square
          // whatever the radius.)
          bodyWidthRatio: 1,
          candlePainter: renkoBrick,
          entryAnimation: 'fade',
          entryMs: 300,
        }}
      />
      <YLabel seriesId="renko" />
      <Crosshair />
      <YAxis />
      <XAxis />
    </ChartContainer>
  );
}
