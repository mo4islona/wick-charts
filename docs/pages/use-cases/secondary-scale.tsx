import type { ChartTheme } from '@wick-charts/react';

import { AdvancedLayout, type Step } from '../../components/AdvancedLayout';
import { SecondaryScaleDemo } from './secondary-scale.example';
import source from './secondary-scale.example.tsx?raw';

export const STEPS: Step[] = [
  {
    heading: '01 — NAME A SCALE',
    body: (
      <>
        <code>scales</code> on the container declares named Y scales. Each one takes the same fields as{' '}
        <code>axis.y</code> — <code>position</code>, <code>min</code> / <code>max</code>, <code>width</code>,{' '}
        <code>visible</code>, a <code>scale</code> transform such as <code>logScale()</code>. <code>position</code>{' '}
        defaults to the side opposite the default axis. Keep the object stable: a changed scale refits.
      </>
    ),
    code: `const SCALES = { rsi: { position: 'left', min: 0, max: 100 } };\n\n<ChartContainer scales={SCALES}>…</ChartContainer>`,
  },
  {
    heading: '02 — PUT A SERIES ON IT',
    body: (
      <>
        A line, bar, candlestick or band series opts in with <code>scale</code>. It autoscales on its own — here pinned
        to 0..100 — while the price keeps the default scale, and both share the time axis. A series without{' '}
        <code>scale</code> stays on the default scale.
      </>
    ),
    code: `<LineSeries id="price" data={price} />\n<LineSeries id="rsi" scale="rsi" data={rsi} />`,
  },
  {
    heading: '03 — GIVE IT AN AXIS',
    body: (
      <>
        <code>&lt;YAxis scale="rsi" /&gt;</code> renders that scale's column; its <code>format</code> also drives the
        crosshair label on that side. One column fits on each side — <code>visible: false</code> makes an overlay scale
        with no column. Grid lines follow the default scale.
      </>
    ),
    code: `<YAxis />\n<YAxis scale="rsi" format={(v) => v.toFixed(0)} />`,
  },
  {
    heading: '04 — ANNOTATE IN ITS UNITS',
    body: (
      <>
        <code>ReferenceLine</code>, <code>Marker</code> and <code>YLabel</code> take <code>scale</code> too. A{' '}
        <code>YLabel</code> follows its series' scale on its own and sits on that scale's side.
      </>
    ),
    code: `<ReferenceLine value={70} scale="rsi" label="overbought" />\n<YLabel seriesId="rsi" />`,
  },
];

export function SecondaryScalePage({ theme }: { theme: ChartTheme }) {
  return (
    <AdvancedLayout
      theme={theme}
      source={source}
      lead={
        <p style={{ margin: 0 }}>
          Two unrelated measures on one pane — a price and its RSI, a request rate and its error rate. Each sits on its
          own Y scale with its own autoscale, and they share the time axis, the crosshair and the tooltip.
        </p>
      }
      chart={<SecondaryScaleDemo theme={theme} />}
      mobileChartHeight={380}
      steps={STEPS}
    />
  );
}
