import type { ChartTheme } from '@wick-charts/react';

import { AdvancedLayout, type Step } from '../../components/AdvancedLayout';
import { useIsMobile } from '../../hooks/useIsMobile';
import { CategoryBarsDemo } from './category-bars.example';
import source from './category-bars.example.tsx?raw';

const STEPS: Step[] = [
  {
    heading: '01 — GROUP THE LAYERS',
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
    heading: '02 — FIX THE ORDER',
    body: (
      <>
        Bands follow the order the data first names them. <code>axis.x.categories</code> puts the listed names first, in
        list order — also a name no series has data for yet, as an empty band. Names not in the list follow in
        first-seen order.
      </>
    ),
    code: `<ChartContainer axis={{ x: { type: 'category', categories: ['Asia', 'Europe', 'Americas'] } }}>`,
  },
  {
    heading: '03 — LABEL THE VALUES',
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
    heading: '04 — STACK, OR SHOW SHARES',
    body: (
      <>
        <code>stacking: 'normal'</code> draws one column per band, with the column total as its label.{' '}
        <code>'percent'</code> draws each layer's share of the column, so every column fills 100%; it has no labels.
      </>
    ),
    code: `<BarSeries data={layers} options={{ stacking: 'percent' }} />`,
  },
  {
    heading: '05 — NEGATIVE VALUES',
    body: (
      <>
        A negative bar grows down from zero, rounds its lower end and hangs its label below. In a 100% stack a column
        splits by its absolute sum: +3 and −1 give +75% up and −25% down.
      </>
    ),
    code: `<BarSeries data={[{ label: '2025', data: [{ x: 'Asia', value: 6 }, { x: 'Americas', value: -6 }] }]} />`,
  },
  {
    heading: '06 — CATEGORIES THAT COME AND GO',
    body: (
      <>
        Pass the new array. A category that leaves fades out in its own band, then the bands close up and the later bars
        slide over; one that comes back slides the others aside and fades in. Values that change ease to their new
        height. Hovering a band shades it and lists every layer in the tooltip.
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
          Revenue by region, votes by option, latency by endpoint: a bar chart over names. Group a series' layers side
          by side, stack them or show their shares, label the values, and keep the bars readable while categories come
          and go.
        </p>
      }
      chart={chart}
      chartHeight="min(680px, calc(100vh - 96px))"
      framedChart={false}
      steps={STEPS}
    />
  );
}
