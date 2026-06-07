import { useMemo } from 'react';

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

import { AdvancedLayout, type Step } from '../../components/AdvancedLayout';
import { generateOHLCData } from '../../data';
import source from './custom-renders.tsx?raw';

const COUNT = 240;
const INTERVAL = 60_000 * 60;

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
 *  whatever the random walk produces — ~26 boxes across the full range, floored
 *  at 0.5 and snapped to the nearest half. */
function boxSizeFor(candles: OHLCData[]): number {
  if (candles.length === 0) return 1;

  let min = candles[0].close;
  let max = candles[0].close;
  for (const candle of candles) {
    if (candle.close < min) min = candle.close;
    if (candle.close > max) max = candle.close;
  }

  const raw = (max - min) / 26;

  return Math.max(0.5, Math.round(raw * 2) / 2);
}

interface RenkoOptions {
  boxSize: number;
  interval: number;
  startTime: number;
}

/**
 * Classic close-based renko. Walk the close prices and emit a fixed-size brick
 * every time price clears a full box past the most recent brick; a reversal
 * needs two boxes against the trend (one box already sits in the other
 * direction). A strong move stacks several bricks on one candle, a quiet stretch
 * none. Time is discarded — each brick takes the next equally-spaced slot.
 */
function toRenko(candles: OHLCData[], opts: RenkoOptions): OHLCData[] {
  const { boxSize, interval, startTime } = opts;
  const bricks: OHLCData[] = [];
  if (candles.length === 0 || boxSize <= 0) return bricks;

  // `top` / `bottom` track the price edges of the most recent brick.
  let top = Math.round(candles[0].close / boxSize) * boxSize;
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

  for (const candle of candles) {
    const price = candle.close;

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

const STEPS: Step[] = [
  {
    heading: '01 — A PAINTER IS THE RENDERER',
    body: (
      <>
        A custom renderer here is just a function — no subclass, no fork. The engine keeps owning layout, scales, pan /
        zoom, axes and the crosshair; it resolves the exact bitmap rectangle each element occupies and hands your
        painter the live 2D context. Everything inside that rect is yours to draw.
      </>
    ),
    code: `const renkoBrick: CandlePainter = (env, args) => {\n  // env: live 2D context + device-pixel ratios + theme\n  const { ctx, horizontalPixelRatio, verticalPixelRatio } = env;\n  // args: the rect the engine resolved + semantics (color, isBullish, radius...)\n  const { geom, color } = args;\n  // ...draw onto ctx, within geom\n};`,
  },
  {
    heading: '02 — DRAW THE ELEMENT YOURSELF',
    body: (
      <>
        Own the pixels. Here each candle body becomes a Renko brick: inset the engine's rect by one device pixel on
        every side so neighbours separate into a brick wall, then fill with the semantic <code>color</code>. It's a raw
        canvas — it could just as easily be an arc, a gradient, or a sprite.
      </>
    ),
    code: `const x = geom.x + horizontalPixelRatio;\nconst y = geom.y + verticalPixelRatio;\nconst w = Math.max(1, geom.width - horizontalPixelRatio * 2);\nconst h = Math.max(1, geom.height - verticalPixelRatio * 2);\n\nctx.fillStyle = color;\nctx.fillRect(x, y, w, h); // the inset gap reads through as mortar`,
  },
  {
    heading: '03 — HAND IT TO THE SERIES',
    body: (
      <>
        Pass the function straight to <code>candlePainter</code> — that's the whole wiring. It's read fresh every frame;
        keep it a stable reference (module scope or <code>useCallback</code>) so the wrapper diffs it cleanly. Feed it
        any data — here, brick OHLC from an ordinary <code>toRenko</code> transform (see Source).
      </>
    ),
    code: `<CandlestickSeries\n  data={bricks}\n  options={{ candlePainter: renkoBrick, bodyWidthRatio: 1, cornerRadius: 0 }}\n/>`,
  },
];

export function CustomRendersPage({ theme }: { theme: ChartTheme }) {
  const bricks = useMemo(() => {
    const candles = generateOHLCData(COUNT, 100, INTERVAL);
    const boxSize = boxSizeFor(candles);
    const startTime = candles[0]?.time ?? 0;

    return toRenko(candles, { boxSize, interval: INTERVAL, startTime });
  }, []);

  const up = flatColor(theme.candlestick.up.body);
  const down = flatColor(theme.candlestick.down.body);

  return (
    <AdvancedLayout
      theme={theme}
      source={source}
      lead={
        <>
          A custom renderer in Wick Charts isn't a fork or a subclass — it's a small <code>candlePainter</code> function
          that owns the pixels of each element while the engine keeps doing layout, scales, pan / zoom and the
          crosshair. Here we build one that draws candle bodies as Renko bricks; the brick data itself is an ordinary
          transform (see Source).
        </>
      }
      framedChart={false}
      chart={
        <div
          style={{
            flex: 1,
            minHeight: 280,
            maxHeight: 440,
            border: `1px solid ${theme.tooltip.borderColor}`,
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <ChartContainer theme={theme}>
            <Title sub="Renko · custom candle painter">BTC/USD</Title>
            <CandlestickSeries
              id="renko"
              data={bricks}
              options={{
                up: { body: up, wick: up },
                down: { body: down, wick: down },
                bodyWidthRatio: 1,
                cornerRadius: 0,
                candlePainter: renkoBrick,
                entryAnimation: 'fade',
                entryMs: 200,
              }}
            />
            <YLabel seriesId="renko" />
            <Crosshair />
            <YAxis />
            <XAxis />
          </ChartContainer>
        </div>
      }
      steps={STEPS}
    />
  );
}
