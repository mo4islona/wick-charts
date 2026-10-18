import { useEffect, useMemo, useState } from 'react';

import {
  ChartContainer,
  type ChartTheme,
  Crosshair,
  type DepthLevel,
  DepthSeries,
  Legend,
  Title,
  Tooltip,
  XAxis,
  YAxis,
  perfHud,
} from '@wick-charts/react';

import { Cell } from '../components/Cell';
import type { PropValue } from '../components/CodePreview';
import { Button } from '../components/kit';
import { ICONS } from '../components/playground/icons';
import { Playground, type PlaygroundChartProps } from '../components/playground/Playground';
import { Slider, Toggle } from '../components/playground/primitives';
import type { RowSpec, SectionSpec } from '../components/playground/sections';

interface DepthSettings {
  tooltipVisible: boolean;
  legendVisible: boolean;
  crosshairVisible: boolean;
  strokeWidth: number;
  /** Largest mid move per tick, in USD. */
  volatility: number;
  /** Gap between the simulated best bid and best ask, in USD. */
  spread: number;
  /** Half-width of the view in percent of mid; `0` fits the book. */
  spanPct: number;
  levels: number;
  rate: number;
  introMs: number;
  updateMs: number;
  /** Bumped by the Replay button — remounting the chart replays the intro. */
  introEpoch: number;
}

// Stable outside the components: `axis.x.type` is read once, at construction.
const DEPTH_AXIS = { x: { type: 'numeric' as const }, y: { min: 0 } };

const TICK = 0.5;
// How far from mid the simulated book places its levels, in USD.
const REACH = 600;
const START_MID = 64_812;

interface Book {
  bids: DepthLevel[];
  asks: DepthLevel[];
}

/** The simulated book: size by price per side, around a random-walk mid. */
interface BookState {
  mid: number;
  spread: number;
  bids: Map<number, number>;
  asks: Map<number, number>;
}

// Deterministic PRNG (mulberry32) so the prerendered and the hydrated first
// frame paint the same book.
function mulberry32(seed: number): () => number {
  let a = seed;

  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bestBidOf(state: BookState): number {
  return Math.floor((state.mid - state.spread / 2) / TICK) * TICK;
}

function bestAskOf(state: BookState): number {
  return bestBidOf(state) + Math.max(TICK, Math.round(state.spread / TICK) * TICK);
}

/** A size in BTC: small near mid, deeper further out, now and then a wall. */
function levelSize(args: { rand: () => number; distance: number }): number {
  const { rand, distance } = args;
  const depth = 0.6 + distance / REACH;
  const wall = rand() < 0.04 ? 4 + rand() * 9 : 0;

  return Math.round((0.1 + rand() * 1.4 * depth + wall) * 1000) / 1000;
}

/** Add a level at a random distance from the best price — denser near mid. */
function addLevel(args: { side: Map<number, number>; best: number; direction: 1 | -1; rand: () => number }): void {
  const { side, best, direction, rand } = args;
  const distance = Math.round((REACH * rand() ** 1.6) / TICK) * TICK;
  const price = best + direction * distance;
  if (side.has(price)) return;

  side.set(price, levelSize({ rand, distance }));
}

function fillSide(args: { state: BookState; levels: number; rand: () => number }): void {
  const { state, levels, rand } = args;
  const bestBid = bestBidOf(state);
  const bestAsk = bestAskOf(state);

  // A few attempts per missing level: a draw can land on a taken price.
  for (let attempt = 0; attempt < levels * 4 && state.bids.size < levels; attempt++) {
    addLevel({ side: state.bids, best: bestBid, direction: -1, rand });
  }
  for (let attempt = 0; attempt < levels * 4 && state.asks.size < levels; attempt++) {
    addLevel({ side: state.asks, best: bestAsk, direction: 1, rand });
  }

  if (!state.bids.has(bestBid)) state.bids.set(bestBid, levelSize({ rand, distance: 0 }));
  if (!state.asks.has(bestAsk)) state.asks.set(bestAsk, levelSize({ rand, distance: 0 }));
}

function seedBook(args: { levels: number; spread: number }): BookState {
  const { levels, spread } = args;
  const state: BookState = { mid: START_MID, spread, bids: new Map(), asks: new Map() };
  fillSide({ state, levels, rand: mulberry32(91) });

  return state;
}

/** One tick: mid walks, crossed and far levels drop, sizes drift, new orders land. */
function stepBook(args: { state: BookState; levels: number; volatility: number; spread: number }): void {
  const { state, levels, volatility, spread } = args;
  const rand = Math.random;
  state.mid += (rand() * 2 - 1) * volatility;
  state.spread = spread;

  const bestBid = bestBidOf(state);
  const bestAsk = bestAskOf(state);
  for (const [price, size] of state.bids) {
    const gone = price > bestBid || price < bestBid - REACH || rand() < 0.03;
    if (gone) {
      state.bids.delete(price);
    } else if (rand() < 0.25) {
      state.bids.set(price, Math.round(size * (0.7 + rand() * 0.6) * 1000) / 1000);
    }
  }
  for (const [price, size] of state.asks) {
    const gone = price < bestAsk || price > bestAsk + REACH || rand() < 0.03;
    if (gone) {
      state.asks.delete(price);
    } else if (rand() < 0.25) {
      state.asks.set(price, Math.round(size * (0.7 + rand() * 0.6) * 1000) / 1000);
    }
  }

  fillSide({ state, levels, rand });
}

function snapshot(state: BookState): Book {
  return { bids: Array.from(state.bids), asks: Array.from(state.asks) };
}

/** A simulated BTC/USD book that re-publishes a full snapshot `rate` times a second. */
function useOrderBook(args: { levels: number; rate: number; volatility: number; spread: number }): Book {
  const { levels, rate, volatility, spread } = args;
  const [state] = useState(() => seedBook({ levels, spread }));
  const [book, setBook] = useState(() => snapshot(state));

  useEffect(() => {
    const timer = window.setInterval(() => {
      // A hidden tab throttles timers, then fires a burst on return.
      if (document.hidden) return;

      stepBook({ state, levels, volatility, spread });
      setBook(snapshot(state));
    }, 1000 / rate);

    return () => window.clearInterval(timer);
  }, [state, levels, rate, volatility, spread]);

  return book;
}

/** The library's own step line width — the Code tab shows `strokeWidth` only when it differs. */
const DEFAULT_STROKE_WIDTH = 1;

const formatSize = (value: number) => `${value.toFixed(2)} BTC`;

function OrderBookChart({
  theme,
  gradient,
  perfHudVisible,
  tooltipVisible,
  legendVisible,
  crosshairVisible,
  strokeWidth,
  spanPct,
  levels,
  rate,
  volatility,
  spread,
  introMs,
  updateMs,
}: PlaygroundChartProps & DepthSettings) {
  const book = useOrderBook({ levels, rate, volatility, spread });

  return (
    <ChartContainer
      theme={theme}
      axis={DEPTH_AXIS}
      gradient={gradient}
      perf={perfHudVisible ? perfHud() : undefined}
      style={{ minHeight: 0 }}
    >
      <Title sub="numeric price X axis · cumulative size on Y">BTC/USD order book</Title>
      <DepthSeries
        bids={book.bids}
        asks={book.asks}
        options={{ span: spanPct > 0 ? spanPct / 100 : undefined, strokeWidth, introMs, updateMs }}
      />
      <XAxis minLabelSpacing={64} />
      <YAxis />
      {crosshairVisible && <Crosshair />}
      {tooltipVisible && <Tooltip format={formatSize} />}
      {legendVisible && <Legend />}
    </ChartContainer>
  );
}

const DISPLAY_EXTRA: SectionSpec = {
  id: 'display-depth',
  title: 'Display',
  extend: 'display',
  icon: ICONS.display,
  rows: [
    {
      key: 'tooltipVisible',
      label: 'Tooltip',
      hint: 'Side, level price and cumulative size under the pointer.',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'legendVisible',
      label: 'Legend',
      hint: 'Toggle the bid and ask walls.',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
    {
      key: 'crosshairVisible',
      label: 'Crosshair',
      hint: 'Price and size labels at the cursor on the axes.',
      render: (v, onChange) => <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />,
    },
  ] as RowSpec[],
};

const SERIES_SECTION: SectionSpec = {
  id: 'series',
  title: 'Series',
  icon: ICONS.series,
  defaultOpen: true,
  rows: [
    {
      key: 'spanPct',
      label: 'Span',
      hint: 'Half-width of the view around mid, in percent of mid. 0 fits the book. Wheel or pinch to zoom; double-click resets.',
      render: (v, onChange) => (
        <Slider value={v as number} min={0} max={2} step={0.1} suffix="%" onChange={onChange as (v: number) => void} />
      ),
    },
    {
      key: 'strokeWidth',
      label: 'Line width',
      hint: 'Width of the step line on each wall. 0 leaves only the fill.',
      render: (v, onChange) => (
        <Slider value={v as number} min={0} max={4} step={0.5} suffix="px" onChange={onChange as (v: number) => void} />
      ),
    },
  ] as RowSpec[],
};

// The simulated book — demo data, not chart options, so the Code tab leaves it out.
const DEMO_EXTRA: SectionSpec = {
  id: 'demo-depth',
  title: 'Demo',
  extend: 'demo',
  rows: [
    {
      key: 'levels',
      label: 'Levels',
      hint: 'Price levels on each side of the simulated book.',
      render: (v, onChange) => (
        <Slider value={v as number} min={20} max={200} step={10} onChange={onChange as (v: number) => void} />
      ),
    },
    {
      key: 'rate',
      label: 'Updates',
      hint: 'Full snapshots per second.',
      render: (v, onChange) => (
        <Slider value={v as number} min={1} max={30} step={1} suffix="/s" onChange={onChange as (v: number) => void} />
      ),
    },
    {
      key: 'spread',
      label: 'Spread',
      hint: 'Gap between the best bid and the best ask, in USD.',
      render: (v, onChange) => (
        <Slider value={v as number} min={0.5} max={50} step={0.5} onChange={onChange as (v: number) => void} />
      ),
    },
    {
      key: 'volatility',
      label: 'Volatility',
      hint: 'Largest move of the simulated mid per update, in USD. Raise it to watch the view glide after mid.',
      render: (v, onChange) => (
        <Slider value={v as number} min={0} max={30} step={1} onChange={onChange as (v: number) => void} />
      ),
    },
  ] as RowSpec[],
};

/** The Replay row hosts a docs-kit button, which takes the page theme. */
function motionSection(theme: ChartTheme): SectionSpec {
  return {
    id: 'motion-depth',
    title: 'Animation',
    icon: ICONS.display,
    rows: [
      {
        key: 'introMs',
        label: 'Intro',
        hint: 'Both walls grow out from mid; the full reveal lasts ~2×. 0 paints instantly.',
        render: (v, onChange) => (
          <Slider
            value={v as number}
            min={0}
            max={1500}
            step={50}
            suffix="ms"
            onChange={onChange as (v: number) => void}
          />
        ),
      },
      {
        key: 'introEpoch',
        label: 'Replay intro',
        hint: 'Remount the chart to play the intro again.',
        render: (v, onChange) => (
          <Button
            theme={theme}
            ariaLabel="Replay the intro animation"
            onClick={() => (onChange as (v: number) => void)((v as number) + 1)}
          >
            ▶ Replay
          </Button>
        ),
      },
      {
        key: 'updateMs',
        label: 'Morph',
        hint: 'Ease from the book on screen to each update, the mid glide and the hover highlight. 0 snaps.',
        render: (v, onChange) => (
          <Slider
            value={v as number}
            min={0}
            max={1000}
            step={50}
            suffix="ms"
            onChange={onChange as (v: number) => void}
          />
        ),
      },
    ] as RowSpec[],
  };
}

export function DepthPage({ theme }: { theme: ChartTheme }) {
  const sections = useMemo(() => [DEMO_EXTRA, DISPLAY_EXTRA, SERIES_SECTION, motionSection(theme)], [theme]);

  return (
    <Playground<DepthSettings>
      id="depth"
      theme={theme}
      extraDefaults={{
        tooltipVisible: true,
        legendVisible: true,
        crosshairVisible: true,
        strokeWidth: DEFAULT_STROKE_WIDTH,
        spanPct: 0.25,
        levels: 80,
        rate: 3,
        volatility: 3,
        spread: 1,
        introMs: 500,
        updateMs: 500,
        introEpoch: 0,
      }}
      gridTemplate="1fr"
      gridColumns="1fr"
      mobileRowHeight={420}
      hideCartesian
      // Depth motion is driven by the per-series introMs / updateMs rows in
      // the Animation section below — suppress the built-in per-kind sliders.
      animationKinds={[]}
      sections={sections}
      charts={(props) => (
        <Cell theme={props.theme}>
          <OrderBookChart key={`book-${props.perfHudVisible}-${props.introMs}-${props.introEpoch}`} {...props} />
        </Cell>
      )}
      codeConfig={(s) => {
        const containerProps: Record<string, PropValue> = { axis: { x: { type: 'numeric' }, y: { min: 0 } } };
        if (s.gradient) containerProps.gradient = true;
        if (s.perfHudVisible) containerProps.perf = 'perfHud()';

        const options: Record<string, PropValue> = { introMs: s.introMs, updateMs: s.updateMs };
        if (s.spanPct > 0) options.span = s.spanPct / 100;
        if (s.strokeWidth !== DEFAULT_STROKE_WIDTH) options.strokeWidth = s.strokeWidth;

        return {
          theme: 'catppuccin.theme',
          containerProps,
          components: [
            { component: 'DepthSeries', props: { bids: 'bids', asks: 'asks', options } },
            { component: 'XAxis', props: {} },
            { component: 'YAxis', props: {} },
            ...(s.crosshairVisible ? [{ component: 'Crosshair', props: {} }] : []),
            ...(s.tooltipVisible ? [{ component: 'Tooltip', props: {} }] : []),
            ...(s.legendVisible ? [{ component: 'Legend', props: {} }] : []),
          ],
        };
      }}
    />
  );
}
