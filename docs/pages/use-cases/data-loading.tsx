import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  CandlestickSeries,
  ChartContainer,
  type ChartTheme,
  Crosshair,
  EdgeLoader,
  type OHLCData,
  Title,
  XAxis,
  YAxis,
  YLabel,
  skeletonLoadingIndicator,
  skeletonMorphIntro,
  useChartInstance,
} from '@wick-charts/react';

import { AdvancedLayout, type Step } from '../../components/AdvancedLayout';
import { generateOHLCData } from '../../data';
import source from './data-loading.tsx?raw';

const INTERVAL = 60_000 * 60; // 1-hour candles
const PAGE_SIZE = 100;
const INITIAL_PAGES = 2;
const MAX_PAGES = 8;
const INITIAL_VISIBLE_BARS = 60;
const NEAR_EDGE_BARS = 8;
const FETCH_DELAY_MS = 400;

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

    out[i] = { time: next.time - (count - i) * interval, open, high, low, close: round(close) };
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

const INDICATOR_SNIPPET = `<EdgeLoader
  side="left"
  threshold={8}
  onTrigger={loadOlder}
  indicator={skeletonLoadingIndicator}
/>`;

const CUSTOM_INDICATOR_SNIPPET = `import type { LoadingIndicatorFn } from '@wick-charts/core';

// { scope, theme, chartMediaWidth, chartMediaHeight, now, side, edgeValueY }
const dashLoader: LoadingIndicatorFn = ({ scope, chartMediaWidth, chartMediaHeight }) => {
  scope.context.strokeRect(
    0, 0,
    chartMediaWidth * scope.horizontalPixelRatio,
    chartMediaHeight * scope.verticalPixelRatio,
  );
};

<EdgeLoader side="left" onTrigger={loadOlder} indicator={dashLoader} />`;

const REVEAL_SNIPPET = `// skeletonMorphIntro: the loading indicator reports its placeholder
// geometry, and the candles that land where placeholders stood GROW
// OUT of those exact shapes — gray placeholder becomes a real candle.
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
        <code>&lt;EdgeLoader&gt;</code> triggers <code>onTrigger</code> when panning/zooming nears the data edge — same
        mechanism as the load-on-scroll use case. What's new here: its <code>indicator</code> prop now accepts a
        function instead of just <code>'canvas'</code> / <code>'custom'</code>. <code>skeletonLoadingIndicator</code>{' '}
        paints muted placeholder candle shapes with a shimmer sweeping across them — the classic skeleton-screen pattern
        — with the bar nearest the boundary centered on the real candle's value, so it still reads as a continuation of
        the chart, not a generic spinner.
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
        chart the way <code>skeletonLoadingIndicator</code> does. It's a peer of the built-in, not a second-class hook.
      </>
    ),
    code: CUSTOM_INDICATOR_SNIPPET,
  },
  {
    heading: '03 — THE ARRIVAL IS ANIMATED TOO',
    body: (
      <>
        When the fetched history lands, the placeholders don't just vanish — this chart uses{' '}
        <code>skeletonMorphIntro</code>, so the real candles grow out of the exact shapes the skeleton was showing,
        blending from placeholder gray to their own colors, while deeper history waves in from the boundary. The
        choreography is the <code>historyReveal</code> series option: the same pluggable-function contract as{' '}
        <code>introAnimation</code> (<code>fadeIntro</code> is the default; <code>riseIntro</code>,{' '}
        <code>candleUnfoldIntro</code> and custom fns work unchanged), with the wave's stagger anchored at the boundary.
        Lines back-fill behind a clip front (<code>backfillSweepIntro</code>) instead.
      </>
    ),
    code: REVEAL_SNIPPET,
  },
];

export function DataLoadingPage({ theme }: { theme: ChartTheme }) {
  const initial = useMemo(() => generateOHLCData(PAGE_SIZE * INITIAL_PAGES, 100, INTERVAL), []);
  const [data, setData] = useState<OHLCData[]>(initial);
  const [pagesLoaded, setPagesLoaded] = useState(INITIAL_PAGES);

  const loadOlder = useCallback(() => {
    return new Promise<boolean>((resolve) => {
      setTimeout(() => {
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
      }, FETCH_DELAY_MS);
    });
  }, []);

  return (
    <AdvancedLayout
      theme={theme}
      source={source}
      lead={
        <>
          Pan the chart to the left. As the visible range nears the data's start, <code>&lt;EdgeLoader&gt;</code>{' '}
          simulates a history fetch and shows its (now pluggable) boundary indicator.
        </>
      }
      chart={
        <ChartContainer theme={theme} style={{ height: 460 }}>
          <Title sub={`${pagesLoaded * PAGE_SIZE} candles · pan left`}>BTC/USD</Title>
          <CandlestickSeries id="candle" data={data} options={{ historyReveal: skeletonMorphIntro() }} />
          <InitialZoom bars={INITIAL_VISIBLE_BARS} />
          <EdgeLoader
            side="left"
            threshold={NEAR_EDGE_BARS}
            onTrigger={loadOlder}
            indicator={skeletonLoadingIndicator}
          />
          <YLabel seriesId="candle" />
          <Crosshair />
          <YAxis />
          <XAxis />
        </ChartContainer>
      }
      steps={STEPS}
    />
  );
}
