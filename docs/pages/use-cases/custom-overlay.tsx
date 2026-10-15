import { useEffect, useMemo, useState } from 'react';

import {
  BandSeries,
  CandlestickSeries,
  ChartContainer,
  type ChartTheme,
  Crosshair,
  LineSeries,
  type OHLCData,
  Title,
  XAxis,
  YAxis,
  YLabel,
  useChartInstance,
} from '@wick-charts/react';

import { AdvancedLayout, type Step } from '../../components/AdvancedLayout';
import { generateOHLCData } from '../../data';
import source from './custom-overlay.tsx?raw';

const COUNT = 250;
const INTERVAL = 60_000 * 60;
const SMA_PERIOD = 20;

interface BollingerPoint {
  time: number;
  mid: number;
  upper: number;
  lower: number;
}

function computeBollinger(candles: OHLCData[], period: number): BollingerPoint[] {
  if (candles.length < period) return [];

  const out: BollingerPoint[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += candles[j].close;
    }
    const mid = sum / period;

    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = candles[j].close - mid;
      variance += d * d;
    }
    const sd = Math.sqrt(variance / period);

    out.push({
      time: candles[i].time,
      mid,
      upper: mid + 2 * sd,
      lower: mid - 2 * sd,
    });
  }

  return out;
}

/** The newest point inside the visible time range, or `null` when none is on screen. */
function lastVisible(points: readonly BollingerPoint[], range: { from: number; to: number }): BollingerPoint | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const point = points[i];
    if (point.time > range.to) continue;
    if (point.time < range.from) return null;

    return point;
  }

  return null;
}

function EdgeLabel({
  x,
  y,
  color,
  text,
  above,
}: {
  x: number;
  y: number;
  color: string;
  text: string;
  above: boolean;
}) {
  return (
    <>
      <circle cx={x} cy={y} r={2.5} fill={color} />
      <text
        x={x - 6}
        y={above ? y - 6 : y + 6}
        textAnchor="end"
        dominantBaseline={above ? 'auto' : 'hanging'}
        fill={color}
        fontSize={11}
        fontWeight={600}
      >
        {text}
      </text>
    </>
  );
}

function BandEdgeLabels({ bollinger, color }: { bollinger: BollingerPoint[]; color: string }) {
  const chart = useChartInstance();
  const [, bump] = useState(0);

  // Track the values that move our pixel mapping: viewport (timeScale.from/to,
  // yScale.min/max) and overlay-affecting changes (resize, theme, axis width).
  useEffect(() => {
    const tick = () => bump((n) => n + 1);
    chart.on('viewportChange', tick);
    chart.on('overlayChange', tick);

    return () => {
      chart.off('viewportChange', tick);
      chart.off('overlayChange', tick);
    };
  }, [chart]);

  const anchor = lastVisible(bollinger, chart.getVisibleRange());
  if (anchor === null) return null;

  const x = chart.timeScale.timeToX(anchor.time);
  const upperY = chart.yScale.valueToY(anchor.upper);
  const lowerY = chart.yScale.valueToY(anchor.lower);

  // The plot area, whichever side the Y axis sits on.
  const { chartArea } = chart.getLayout();

  return (
    <svg
      style={{
        position: 'absolute',
        left: chartArea.x,
        top: chartArea.y,
        width: chartArea.width,
        height: chartArea.height,
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      <title>Bollinger band edges</title>
      <EdgeLabel x={x} y={upperY} color={color} text="Upper" above />
      <EdgeLabel x={x} y={lowerY} color={color} text="Lower" above={false} />
    </svg>
  );
}

const STEPS: Step[] = [
  {
    heading: '01 — RENDER AS A CHILD',
    body: (
      <>
        The band and its midline are built-in series: <code>&lt;BandSeries&gt;</code> fills between <code>low</code> and{' '}
        <code>high</code>, and a <code>&lt;LineSeries&gt;</code> draws the SMA. Anything else you put inside{' '}
        <code>&lt;ChartContainer&gt;</code> lands in an absolutely positioned overlay above the canvas — here, the edge
        labels. Your component has access to the chart via <code>useChartInstance()</code>.
      </>
    ),
    code: `<ChartContainer>\n  <BandSeries data={{ label: 'Bollinger', data: band }} />\n  <CandlestickSeries data={candles} />\n  <LineSeries data={{ label: 'SMA 20', data: mid }} />\n  <BandEdgeLabels bollinger={bollinger} color="#7AA9FF" />\n  <YAxis />\n  <XAxis />\n</ChartContainer>`,
  },
  {
    heading: '02 — MAP DATA TO PIXELS',
    body: (
      <>
        Find the newest point inside <code>chart.getVisibleRange()</code>, then read the chart's scales:{' '}
        <code>timeScale.timeToX(time)</code> and <code>yScale.valueToY(value)</code>. Both return CSS pixels inside the
        plot area, so an SVG sized to <code>chart.getLayout().chartArea</code> lines up with it exactly — on either side
        of a left or right Y axis.
      </>
    ),
    code: `const { chartArea } = chart.getLayout(); // { x, y, width, height }\nconst anchor = lastVisible(bollinger, chart.getVisibleRange());\nconst x = chart.timeScale.timeToX(anchor.time);\nconst upperY = chart.yScale.valueToY(anchor.upper);\nconst lowerY = chart.yScale.valueToY(anchor.lower);`,
  },
  {
    heading: '03 — REDRAW ON CHANGE',
    body: (
      <>
        Subscribe to <code>viewportChange</code> (pan / zoom / resize moves the scales and the last visible point) and{' '}
        <code>overlayChange</code> (data updates, axis width changes). A bump-counter <code>useState</code> is enough to
        force a re-render.
      </>
    ),
    code: `useEffect(() => {\n  const tick = () => bump((n) => n + 1);\n  chart.on('viewportChange', tick);\n  chart.on('overlayChange', tick);\n  return () => {\n    chart.off('viewportChange', tick);\n    chart.off('overlayChange', tick);\n  };\n}, [chart]);`,
  },
];

export function CustomOverlayPage({ theme }: { theme: ChartTheme }) {
  // The leading candles only warm up the first band window, so the band starts with the candles.
  const history = useMemo(() => generateOHLCData(COUNT + SMA_PERIOD - 1, 100, INTERVAL), []);
  const candles = useMemo(() => history.slice(SMA_PERIOD - 1), [history]);
  const bollinger = useMemo(() => computeBollinger(history, SMA_PERIOD), [history]);
  const band = useMemo(() => bollinger.map((p) => ({ time: p.time, low: p.lower, high: p.upper })), [bollinger]);
  const mid = useMemo(() => bollinger.map((p) => ({ time: p.time, value: p.mid })), [bollinger]);
  const bandColor = theme.bands.upper;

  return (
    <AdvancedLayout
      theme={theme}
      source={source}
      lead={
        <>
          A 20-period Bollinger Band on a candlestick chart. The band is a built-in <code>&lt;BandSeries&gt;</code> and
          the SMA midline a <code>&lt;LineSeries&gt;</code>; the "Upper" / "Lower" tags are a custom React overlay
          pinned to the band's last visible point. The overlay uses the chart's <code>timeScale</code> and{' '}
          <code>yScale</code> to project data onto pixels — pan and zoom keep it aligned.
        </>
      }
      chart={
        <ChartContainer theme={theme}>
          <Title sub={`Bollinger ${SMA_PERIOD}, 2σ`}>BTC/USD</Title>
          <BandSeries data={{ label: 'Bollinger', color: bandColor, data: band }} />
          <CandlestickSeries id="candle" data={candles} />
          <LineSeries
            data={{ label: `SMA ${SMA_PERIOD}`, color: bandColor, data: mid }}
            options={{ area: { visible: false }, strokeWidth: 1, pulse: false }}
          />
          <BandEdgeLabels bollinger={bollinger} color={bandColor} />
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
