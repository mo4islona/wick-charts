import { useMemo } from 'react';

import type { ChartTheme } from '@wick-charts/react';

import { AdvancedLayout, type Step } from '../../components/AdvancedLayout';
import { generateOHLCData } from '../../data';
import { CustomRendersDemo } from './custom-renders.example';
import source from './custom-renders.example.tsx?raw';

const COUNT = 240;
const INTERVAL = 60_000 * 60;

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
    code: `<CandlestickSeries\n  data={bricks}\n  options={{ candlePainter: renkoBrick, bodyWidthRatio: 1 }}\n/>`,
  },
  {
    heading: '04 — IT STREAMS LIKE ANY SERIES',
    body: (
      <>
        Owning the pixels doesn't opt you out of live updates. The painter has no coupling to where bars come from — it
        runs every frame on whatever bricks exist. The demo re-derives bricks from the close history on each tick (
        <code>toRenko</code> is pure, so existing bricks diff as no-ops) and hands the window to the <code>data</code>{' '}
        prop; a freshly cleared box fades in with the series' entrance animation.
      </>
    ),
    code: `const next = toRenko(closes, grid);\nif (next.length === brickCount) return; // no box cleared\n\nbrickCount = next.length;\nsetBricks(next.slice(-WINDOW)); // diffed → appended → painter fades it in`,
  },
];

export function CustomRendersPage({ theme }: { theme: ChartTheme }) {
  const seed = useMemo(() => generateOHLCData(COUNT, 100, INTERVAL), []);

  return (
    <AdvancedLayout
      theme={theme}
      source={source}
      lead={
        <>
          A custom renderer in Wick Charts isn't a fork or a subclass — it's a small <code>candlePainter</code> function
          that owns the pixels of each element while the engine keeps doing layout, scales, pan / zoom and the
          crosshair. Here we build one that draws candle bodies as live-streaming Renko bricks; the brick data itself is
          an ordinary transform (see Source).
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
          <CustomRendersDemo theme={theme} seed={seed} />
        </div>
      }
      steps={STEPS}
    />
  );
}
