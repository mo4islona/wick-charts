import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  BarSeries,
  CandlestickSeries,
  ChartContainer,
  type ChartTheme,
  Crosshair,
  EdgeLoader,
  LineSeries,
  type OHLCData,
  type TimePoint,
  Title,
  XAxis,
  YAxis,
  YLabel,
  skeletonMorphIntro,
  useChartInstance,
} from '@wick-charts/react';

import { AdvancedLayout, type Step } from '../../components/AdvancedLayout';
import { generateOHLCData } from '../../data';
import source from './data-loading.tsx?raw';
import { type DemoSeries, type Latency, type LoadReport, LoaderPanel } from './loaders/LoaderPanel';
import { LOADER_VARIANTS, type LoaderId } from './loaders/variants';

const INTERVAL = 60_000 * 60; // 1-hour candles
const PAGE_SIZE = 100;
const INITIAL_PAGES = 2;
const MAX_PAGES = 30;
const INITIAL_VISIBLE_BARS = 60;
const NEAR_EDGE_BARS = 8;
/** Bars of empty overshoot the "Jump to edge" view leaves past the data start. */
const JUMP_OVERSHOOT_BARS = 24;
/** `EdgeLoader`'s `minDuration` default — the readout beside the button reports how long the loader stayed. */
const MIN_LOADER_MS = 400;
/** The panel sits in the sticky column above the chart, so the column grows by its height. */
const CHART_COLUMN_HEIGHT = 'min(700px, calc(100vh - 96px))';

/** A positive per-bar series for the bar demo: each candle's high–low range, in basis points of its close. */
function toRange(candle: OHLCData): TimePoint {
  return { time: candle.time, value: Math.round(((candle.high - candle.low) / candle.close) * 10_000) };
}

/**
 * Walk backwards from the existing first candle so each older candle's close
 * matches the next candle's open — chunks chain price-continuously instead
 * of jumping to a fresh seed value.
 */
function makeOlderPage({ count, interval, next }: { count: number; interval: number; next: OHLCData }): OHLCData[] {
  const round = (n: number): number => Math.round(n * 100) / 100;
  const out: OHLCData[] = new Array(count);

  let nextOpen = next.open;
  for (let i = count - 1; i >= 0; i--) {
    const close = nextOpen;
    const drift = (Math.random() - 0.5) * 0.01 * close;
    const open = round(close - drift);
    const wick = Math.random() * 0.005 * close;
    const high = round(Math.max(open, close) + wick);
    const low = round(Math.min(open, close) - wick);
    const volume = Math.round(1000 + Math.random() * 50000 + Math.abs(drift) * 10000);

    out[i] = { time: next.time - (count - i) * interval, open, high, low, close: round(close), volume };
    nextOpen = open;
  }

  return out;
}

function InitialZoom({ bars }: { bars: number }) {
  const chart = useChartInstance();
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current) return;
    chart.setVisibleRange(bars);
    applied.current = true;
  }, [chart, bars]);

  return null;
}

/** Each bump of `request` frames the history start with some empty overshoot — where the loader draws. */
function JumpToEdge({ request }: { request: number }) {
  const chart = useChartInstance();

  useEffect(() => {
    if (request === 0) return;

    const data = chart.getDataRange();
    if (data === null) return;

    chart.setVisibleRange(
      {
        from: data.from - JUMP_OVERSHOOT_BARS * INTERVAL,
        to: data.from + (INITIAL_VISIBLE_BARS - JUMP_OVERSHOOT_BARS) * INTERVAL,
      },
      { gesture: true },
    );
  }, [chart, request]);

  return null;
}

const INDICATOR_SNIPPET = `import { condenseLoadingIndicator } from '@wick-charts/react';

<EdgeLoader
  side="left"
  threshold={8}
  onTrigger={loadOlder}
  indicator={condenseLoadingIndicator}
/>

// Also built in: glassLoadingIndicator, auroraLoadingIndicator,
// halftoneLoadingIndicator, dustLoadingIndicator.`;

const CUSTOM_INDICATOR_SNIPPET = `import type { LoadingIndicatorFn } from '@wick-charts/core';

// { scope, theme, chartMediaWidth, chartMediaHeight, now, side,
//   edgeValueY, baselineY, bodyWidth, strokeWidth, reportPlaceholders }
const dashLoader: LoadingIndicatorFn = ({ scope, chartMediaWidth, chartMediaHeight }) => {
  scope.context.strokeRect(
    0, 0,
    chartMediaWidth * scope.horizontalPixelRatio,
    chartMediaHeight * scope.verticalPixelRatio,
  );
};

<EdgeLoader side="left" onTrigger={loadOlder} indicator={dashLoader} />`;

const MIN_DURATION_SNIPPET = `// On by default: a fetch that answers in 80 ms keeps the loader
// up for 400 ms, and its history lands when the loader leaves.
<EdgeLoader side="left" onTrigger={loadOlder} />

// Tune or turn it off:
<EdgeLoader side="left" onTrigger={loadOlder} minDuration={0} />

// Without EdgeLoader:
chart.setEdgeState('left', 'loading', { minDuration: 400 });`;

const REVEAL_SNIPPET = `// skeletonMorphIntro: the loading indicator reports its placeholder
// geometry, and the candles that land where placeholders stood GROW
// OUT of those exact shapes — a placeholder becomes a real candle.
// Deeper history plays the fallback wave (fadeIntro by default).
<CandlestickSeries
  data={data}
  options={{ historyReveal: skeletonMorphIntro() }}
/>

// Any introAnimation-style factory works here too:
<CandlestickSeries data={data} options={{ historyReveal: riseIntro() }} />

// Opt out — new history appears instantly:
<CandlestickSeries data={data} options={{ historyReveal: 'none' }} />`;

const STEPS: Step[] = [
  {
    heading: '01 — SWAP THE SPINNER',
    body: (
      <>
        <code>&lt;EdgeLoader&gt;</code> calls <code>onTrigger</code> when a pan or zoom nears the data edge — the same
        mechanism as the load-on-scroll use case. Its <code>indicator</code> prop takes a function as well as{' '}
        <code>'canvas'</code> / <code>'custom'</code>, and five presets ship with the library. Condense and Glass draw
        placeholders shaped like the real marks — candle bodies of the real width, bars standing on the zero line, a
        ribbon as thick as the line's stroke — starting at the last real value, so the loader reads as the chart's
        continuation. Aurora, Halftone and Dust are ambient effects anchored at the boundary value. The shader presets
        fall back to flat placeholders without WebGL2, and a preset only lands in bundles that import it.{' '}
        <code>skeletonLoadingIndicator</code> still works but is deprecated.
      </>
    ),
    code: INDICATOR_SNIPPET,
  },
  {
    heading: '02 — OR WRITE YOUR OWN',
    body: (
      <>
        A <code>LoadingIndicatorFn</code> is a plain function — <code>scope</code>/<code>theme</code> to draw with,{' '}
        <code>chartMediaWidth</code>/<code>chartMediaHeight</code> for the clipped stage's size, <code>side</code> and{' '}
        <code>edgeValueY</code> (the boundary's real Y position, when resolvable) if you want to anchor to the real
        chart the way the presets do; <code>bodyWidth</code>, <code>strokeWidth</code> and <code>baselineY</code> size
        placeholders like the real marks. Pass your candle shapes to <code>reportPlaceholders</code> and the morph below
        grows the real candles out of them. It's a peer of the built-ins, not a second-class hook.
      </>
    ),
    code: CUSTOM_INDICATOR_SNIPPET,
  },
  {
    heading: '03 — THE ARRIVAL IS ANIMATED TOO',
    body: (
      <>
        When the fetched history lands, the placeholders don't just vanish — the candles here use{' '}
        <code>skeletonMorphIntro</code>, so with Condense or Glass the real candles grow out of the exact shapes the
        loader was showing, blending from placeholder to their own colors, while deeper history waves in from the
        boundary. The other presets report no shapes, so all new candles play the wave. The choreography is the{' '}
        <code>historyReveal</code> series option: the same pluggable-function contract as <code>introAnimation</code> (
        <code>fadeIntro</code> is the default; <code>riseIntro</code>, <code>candleUnfoldIntro</code> and custom fns
        work unchanged), with the wave's stagger anchored at the boundary. Bars fade in the same way; lines back-fill
        behind a clip front (<code>backfillSweepIntro</code>) instead.
      </>
    ),
    code: REVEAL_SNIPPET,
  },
  {
    heading: '04 — NO FLASH ON A FAST FETCH',
    body: (
      <>
        A fetch that answers in a few milliseconds would show the loader for a frame or two — a flicker, not a signal.{' '}
        <code>EdgeLoader</code> keeps the loader on screen for at least <code>minDuration</code> (400 ms by default) and
        holds the fetched history back until then, so the loader and the arrival animation never overlap. Set the fetch
        to 80 ms above: the readout beside <em>Jump to edge</em> shows the loader held for the full 400 ms.
      </>
    ),
    code: MIN_DURATION_SNIPPET,
  },
];

export function DataLoadingPage({ theme }: { theme: ChartTheme }) {
  const initial = useMemo(() => generateOHLCData(PAGE_SIZE * INITIAL_PAGES, 100, INTERVAL), []);
  const [data, setData] = useState<OHLCData[]>(initial);
  const [pagesLoaded, setPagesLoaded] = useState(INITIAL_PAGES);
  const [loaderId, setLoaderId] = useState<LoaderId>('condense');
  const [latency, setLatency] = useState<Latency>('400');
  const [jumpRequest, setJumpRequest] = useState(0);
  const [series, setSeries] = useState<DemoSeries>('candles');
  const [loading, setLoading] = useState(false);
  const [lastLoad, setLastLoad] = useState<LoadReport | null>(null);

  const loader = LOADER_VARIANTS.find((variant) => variant.id === loaderId) ?? LOADER_VARIANTS[0];
  const lineData = useMemo(() => data.map((candle) => ({ time: candle.time, value: candle.close })), [data]);
  const barData = useMemo(() => data.map(toRange), [data]);
  const candleOptions = useMemo(() => ({ historyReveal: skeletonMorphIntro() }), []);

  // `hold` parks the fetch until another latency is picked, so a loader can be studied at rest.
  const latencyRef = useRef(latency);
  latencyRef.current = latency;
  const heldFetch = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (latency === 'hold') return;

    const release = heldFetch.current;
    heldFetch.current = null;
    release?.();
  }, [latency]);

  const loadOlder = useCallback(() => {
    const startedAt = performance.now();
    setLoading(true);

    return new Promise<boolean>((resolve) => {
      const land = () => {
        const fetchMs = Math.round(performance.now() - startedAt);
        setLoading(false);
        setLastLoad({ fetchMs, shownMs: Math.max(fetchMs, MIN_LOADER_MS) });

        let appended = false;
        setData((prev) => {
          const head = prev[0];
          if (!head) return prev;
          const older = makeOlderPage({ count: PAGE_SIZE, interval: INTERVAL, next: head });
          appended = true;
          return [...older, ...prev];
        });
        setPagesLoaded((p) => {
          const next = p + 1;
          resolve(appended && next < MAX_PAGES);

          return next;
        });
      };

      const current = latencyRef.current;
      if (current === 'hold') {
        heldFetch.current = land;

        return;
      }

      setTimeout(land, Number(current));
    });
  }, []);

  return (
    <AdvancedLayout
      theme={theme}
      source={source}
      lead={
        <>
          Pan the chart to the left, or press <em>Jump to edge</em>. As the visible range nears the data's start,{' '}
          <code>&lt;EdgeLoader&gt;</code> fires a simulated history fetch and paints its loader past the boundary. Pick
          a preset and a series type above the chart; the code line under them echoes the <code>indicator</code> prop.
          The controls under <em>Demo</em> only drive the simulated fetch.
        </>
      }
      chartControls={
        <LoaderPanel
          theme={theme}
          loaderId={loaderId}
          onLoaderChange={setLoaderId}
          series={series}
          onSeriesChange={setSeries}
          latency={latency}
          onLatencyChange={setLatency}
          onJump={() => setJumpRequest((n) => n + 1)}
          loading={loading}
          lastLoad={lastLoad}
        />
      }
      chartHeight={CHART_COLUMN_HEIGHT}
      mobileChartHeight={420}
      chart={
        // A swapped series refits the view to all data, edge included; a fresh chart re-zooms instead.
        <ChartContainer key={series} theme={theme} style={{ flex: 1, minHeight: 0 }}>
          <Title sub={`${pagesLoaded * PAGE_SIZE} ${series === 'candles' ? 'candles' : 'points'} · pan left`}>
            {series === 'bars' ? 'BTC/USD range, bp' : 'BTC/USD'}
          </Title>
          {series === 'candles' && <CandlestickSeries id={series} data={data} options={candleOptions} />}
          {series === 'line' && <LineSeries id={series} data={lineData} />}
          {series === 'bars' && <BarSeries id={series} data={barData} />}
          <InitialZoom bars={INITIAL_VISIBLE_BARS} />
          <JumpToEdge request={jumpRequest} />
          <EdgeLoader side="left" threshold={NEAR_EDGE_BARS} onTrigger={loadOlder} indicator={loader.indicator} />
          <YLabel seriesId={series} />
          <Crosshair />
          <YAxis />
          <XAxis />
        </ChartContainer>
      }
      steps={STEPS}
    />
  );
}
