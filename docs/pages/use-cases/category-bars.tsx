import type { ChartTheme } from '@wick-charts/react';

import { AdvancedLayout, type Step } from '../../components/AdvancedLayout';
import { useIsMobile } from '../../hooks/useIsMobile';
import { routeToPath } from '../../router';
import { CategoryBarsDemo } from './category-bars.example';
import source from './category-bars.example.tsx?raw';

export const STEPS: Step[] = [
  {
    heading: '01 — PUT NAMES ON X',
    body: (
      <>
        <code>axis.x.type: 'category'</code> maps names. Each category gets one band, in the order the series first name
        it, and the bars fill their band. <code>axis.x.padding</code> sets the gap between bands (<code>inner</code>)
        and at the ends (<code>outer</code>), as fractions of a step. Drag and wheel are off on a category axis — set{' '}
        <code>axis.x.panZoom</code> to change that. The type is read once, when the chart is created — remount the chart
        (a React <code>key</code>) to switch.
      </>
    ),
    code: `<ChartContainer axis={{ x: { type: 'category', padding: { inner: 0.3, outer: 0.2 } } }}>\n  <BarSeries data={[{ x: 'Europe', value: 42 }, { x: 'Asia', value: 35 }]} />\n</ChartContainer>`,
  },
  {
    heading: '02 — GROUP THE LAYERS',
    body: (
      <>
        On a category axis, one <code>BarSeries</code> with several layers draws them side by side in each band, in
        layer order, colored from the theme palette. That is the default with <code>stacking: 'off'</code>. Two separate{' '}
        <code>BarSeries</code> still overlap.
      </>
    ),
    code: `<ChartContainer axis={{ x: { type: 'category' } }}>\n  <BarSeries\n    data={[\n      { label: '2024', data: [{ x: 'Europe', value: 46 }, { x: 'Asia', value: 41 }] },\n      { label: '2025', data: [{ x: 'Europe', value: 49 }, { x: 'Asia', value: 47 }] },\n    ]}\n  />\n</ChartContainer>`,
  },
  {
    heading: '03 — FIX THE ORDER',
    body: (
      <>
        <code>axis.x.categories</code> puts the listed names first, in list order — also a name no series has data for
        yet, as an empty band. Names not in the list follow in first-seen order.
      </>
    ),
    code: `<ChartContainer axis={{ x: { type: 'category', categories: ['Asia', 'Europe', 'Americas'] } }}>`,
  },
  {
    heading: '04 — LABEL THE VALUES',
    body: (
      <>
        <code>valueLabels</code> writes each value just past the bar's end. A label wider than its bar is skipped. The
        text follows <code>&lt;YAxis format&gt;</code>; pass <code>{'{ format }'}</code> to set it apart. The color is{' '}
        <code>theme.bar.labelColor</code>.
      </>
    ),
    code: `<BarSeries data={layers} options={{ valueLabels: { format: (v) => \`$\${v}M\` } }} />`,
  },
  {
    heading: '05 — STACK, OR SHOW SHARES',
    body: (
      <>
        <code>stacking: 'normal'</code> draws one column per band, with the column total as its label.{' '}
        <code>'percent'</code> draws each layer's share of the column, so every column fills 100%; it has no labels.
      </>
    ),
    code: `<BarSeries data={layers} options={{ stacking: 'percent' }} />`,
  },
  {
    heading: '06 — NEGATIVE VALUES',
    body: (
      <>
        A negative bar grows down from zero, rounds its lower end and hangs its label below. In a 100% stack a column
        splits by its absolute sum: +3 and −1 give +75% up and −25% down.
      </>
    ),
    code: `<BarSeries data={[{ label: '2025', data: [{ x: 'Asia', value: 6 }, { x: 'Americas', value: -6 }] }]} />`,
  },
  {
    heading: '07 — CATEGORIES THAT COME AND GO',
    body: (
      <>
        Pass the new array. A category that leaves fades out in its own band, then the bands close up and the later bars
        slide over; one that comes back slides the others aside and fades in. Values that change ease to their new
        height, and the Y axis eases with them. A category axis doesn't scroll: the bands refit so every category stays
        in view. Hovering a band shades it and lists every layer in the tooltip. Imperatively, pass the whole array to{' '}
        <code>setSeriesData</code>; <code>updateData</code> replaces only the layer's last point.
      </>
    ),
    code: `const regions = away ? REGIONS.filter((r) => r !== 'Americas') : REGIONS;\n\n<BarSeries data={toLayers(REVENUE, regions)} />`,
  },
];

export function CategoryBarsPage({ theme }: { theme: ChartTheme }) {
  const mobile = useIsMobile();

  // The four cards split the stack's height. Desktop gets it from the sticky
  // chart column; on mobile the page flows, so pin it explicitly.
  const chart = mobile ? (
    <div style={{ height: 820, display: 'flex', flexDirection: 'column' }}>
      <CategoryBarsDemo theme={theme} />
    </div>
  ) : (
    <CategoryBarsDemo theme={theme} />
  );

  return (
    <AdvancedLayout
      theme={theme}
      source={source}
      lead={
        <p style={{ margin: 0 }}>
          Revenue by region, votes by option, latency by endpoint: a bar chart over names. Put a category axis on X,
          group a series' layers side by side, stack them or show their shares, label the values, and keep the bars
          readable while categories come and go. For plain numbers on X, see{' '}
          <a href={routeToPath('use-cases/x-axis-types')}>Numeric X axis</a>.
        </p>
      }
      chart={chart}
      chartHeight="min(680px, calc(100vh - 96px))"
      framedChart={false}
      steps={STEPS}
    />
  );
}
