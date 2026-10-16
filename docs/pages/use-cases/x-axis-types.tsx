import type { ChartTheme } from '@wick-charts/react';

import { AdvancedLayout, type Step } from '../../components/AdvancedLayout';
import { useIsMobile } from '../../hooks/useIsMobile';
import { XAxisTypesDemo } from './x-axis-types.example';
import source from './x-axis-types.example.tsx?raw';

const STEPS: Step[] = [
  {
    heading: '01 — PICK THE AXIS TYPE',
    body: (
      <>
        <code>axis.x.type</code> is <code>'time'</code> by default. <code>'numeric'</code> maps plain numbers,{' '}
        <code>'category'</code> maps names. It is read once, when the chart is created — remount the chart (a React{' '}
        <code>key</code>) to switch.
      </>
    ),
    code: `<ChartContainer axis={{ x: { type: 'numeric' } }}>…</ChartContainer>\n<ChartContainer axis={{ x: { type: 'category' } }}>…</ChartContainer>`,
  },
  {
    heading: '02 — KEY THE POINTS BY X',
    body: (
      <>
        Points carry <code>x</code> in place of <code>time</code>. On a numeric axis the spacing can be irregular — the
        line draws at each <code>x</code> and the crosshair snaps to the nearest point. A point whose <code>x</code>{' '}
        doesn't fit the axis is skipped with a dev warning.
      </>
    ),
    code: `<LineSeries data={[{ x: 1, value: 120 }, { x: 16, value: 940 }, { x: 64, value: 1235 }]} />`,
  },
  {
    heading: '03 — CATEGORIES COME FROM THE DATA',
    body: (
      <>
        Each category gets one band, in the order the series first name it. Bars fill their band;{' '}
        <code>axis.x.padding</code> sets the gap between bands (<code>inner</code>) and at the ends (<code>outer</code>
        ), as fractions of a step. Drag and wheel are off on a category axis — set <code>axis.x.panZoom</code> to change
        that.
      </>
    ),
    code: `<ChartContainer axis={{ x: { type: 'category', padding: { inner: 0.3, outer: 0.2 } } }}>\n  <BarSeries data={[{ x: 'Europe', value: 42 }, { x: 'Asia', value: 35 }]} />\n</ChartContainer>`,
  },
  {
    heading: '04 — FORMAT THE X',
    body: (
      <>
        <code>&lt;XAxis format&gt;</code> gets the number or the category name and formats the tick labels, the
        crosshair label and the tooltip header. <code>crosshairMove</code> and <code>pointClick</code> report it as{' '}
        <code>x</code>.
      </>
    ),
    code: `<XAxis format={(x) => \`\${Number(x).toFixed(1)} km\`} />`,
  },
  {
    heading: '05 — STREAM A NUMERIC AXIS LIKE TIME',
    body: (
      <>
        Keep the points in state and pass them to <code>data</code>. The diff keys on <code>x</code>: a point with a
        new, larger <code>x</code> is appended with its entrance animation, and <code>.slice(-n)</code> rolls the window
        while auto-scroll keeps the newest point in view. <code>x</code> must increase from point to point, as{' '}
        <code>time</code> does. Imperatively, <code>appendData</code> and <code>keepLast</code> do the same.
      </>
    ),
    code: `setRide((prev) => {\n  const last = prev[prev.length - 1];\n\n  return [...prev, { x: last.x + 0.2, value: 284 }].slice(-80);\n});\n\n<LineSeries data={ride} />`,
  },
  {
    heading: '06 — UPDATE ANY CATEGORY',
    body: (
      <>
        Pass the new array: every bar that keeps its band eases to its new value, and the Y axis eases with it. A new
        name adds a band and the bands refit so every category stays in view — a category axis doesn't scroll.
        Imperatively, pass the whole array to <code>setSeriesData</code>; <code>updateData</code> replaces only the
        layer's last point.
      </>
    ),
    code: `setVotes((prev) =>\n  prev.some((v) => v.x === pick)\n    ? prev.map((v) => (v.x === pick ? { ...v, value: v.value + 1 } : v))\n    : [...prev, { x: pick, value: 1 }], // a new band\n);`,
  },
];

export function XAxisTypesPage({ theme }: { theme: ChartTheme }) {
  const mobile = useIsMobile();

  // The four cards split the stack's height. Desktop gets it from the sticky
  // chart column; on mobile the page flows, so pin it explicitly.
  const chart = mobile ? (
    <div style={{ height: 820, display: 'flex', flexDirection: 'column' }}>
      <XAxisTypesDemo theme={theme} />
    </div>
  ) : (
    <XAxisTypesDemo theme={theme} />
  );

  return (
    <AdvancedLayout
      theme={theme}
      source={source}
      lead={
        <p style={{ margin: 0 }}>
          Not every X is a timestamp. A load test runs over concurrency levels, a ride over distance; a breakdown runs
          over regions, a poll over options. Line, bar and band series plot — and stream — over numbers or names as well
          as time.
        </p>
      }
      chart={chart}
      chartHeight="min(680px, calc(100vh - 96px))"
      framedChart={false}
      steps={STEPS}
    />
  );
}
