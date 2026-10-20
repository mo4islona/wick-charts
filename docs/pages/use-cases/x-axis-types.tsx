import type { ChartTheme } from '@wick-charts/react';

import { AdvancedLayout, type Step } from '../../components/AdvancedLayout';
import { useIsMobile } from '../../hooks/useIsMobile';
import { routeToPath } from '../../router';
import { XAxisTypesDemo } from './x-axis-types.example';
import source from './x-axis-types.example.tsx?raw';

const CATEGORY_BARS_PATH = routeToPath('use-cases/category-bars');

export const STEPS: Step[] = [
  {
    heading: '01 — PICK THE AXIS TYPE',
    body: (
      <>
        <code>axis.x.type</code> is <code>'time'</code> by default; <code>'numeric'</code> maps plain numbers. It is
        read once, when the chart is created — remount the chart (a React <code>key</code>) to switch. For names on X,
        use <code>'category'</code>: see <a href={CATEGORY_BARS_PATH}>Category bars</a>.
      </>
    ),
    code: `<ChartContainer axis={{ x: { type: 'numeric' } }}>…</ChartContainer>`,
  },
  {
    heading: '02 — KEY THE POINTS BY X',
    body: (
      <>
        Points carry <code>x</code> in place of <code>time</code>. The spacing can be irregular — the line draws at each{' '}
        <code>x</code> and the crosshair snaps to the nearest point. A point whose <code>x</code> doesn't fit the axis
        is skipped with a dev warning.
      </>
    ),
    code: `<LineSeries data={[{ x: 1, value: 120 }, { x: 16, value: 940 }, { x: 64, value: 1235 }]} />`,
  },
  {
    heading: '03 — FORMAT THE X',
    body: (
      <>
        <code>&lt;XAxis format&gt;</code> gets the number and formats the tick labels, the crosshair label and the
        tooltip header. <code>crosshairMove</code> and <code>pointClick</code> report it as <code>x</code>.
      </>
    ),
    code: `<XAxis format={(x) => \`\${Number(x).toFixed(1)} km\`} />`,
  },
  {
    heading: '04 — STREAM IT LIKE TIME',
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
];

export function XAxisTypesPage({ theme }: { theme: ChartTheme }) {
  const mobile = useIsMobile();

  // The two cards split the stack's height. Desktop gets it from the sticky
  // chart column; on mobile the page flows, so pin it explicitly.
  const chart = mobile ? (
    <div style={{ height: 520, display: 'flex', flexDirection: 'column' }}>
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
          Not every X is a timestamp. A load test runs over concurrency levels, a ride over distance. Line, bar and band
          series plot — and stream — over plain numbers as well as time. For bars over names, see{' '}
          <a href={CATEGORY_BARS_PATH}>Category bars</a>.
        </p>
      }
      chart={chart}
      chartHeight="min(680px, calc(100vh - 96px))"
      framedChart={false}
      steps={STEPS}
    />
  );
}
