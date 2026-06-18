import type { ChartTheme } from '@wick-charts/react';

import { AdvancedLayout, type Step } from '../../components/AdvancedLayout';
import { hexToRgba } from '../../utils';
import { AnnotationsDemo } from './annotations.example';

const STEPS: Step[] = [
  {
    heading: '01 — MARKERS: PIN A MOMENT',
    body: (
      <>
        A <code>&lt;Marker&gt;</code> pins a single moment to the chart — "deploy shipped", "peak", "released". Give it
        an explicit <code>value</code>, <strong>or</strong> a <code>seriesId</code> and it snaps to that series' value
        at <code>time</code>, riding the curve. <code>shape</code> is{' '}
        <code>'dot' | 'circle' | 'arrow-up' | 'arrow-down'</code>; <code>pulse</code> reuses the live line halo;{' '}
        <code>label</code> draws a text pill.
      </>
    ),
    code: `<Marker time={peakMs} seriesId="metric" shape="arrow-down" pulse={true} label="peak" color="#f0556a" />`,
  },
  {
    heading: '02 — REGIONS: SHADE AN INTERVAL',
    body: (
      <>
        A <code>&lt;TimeRegion&gt;</code> shades a time interval with a translucent band — a session, a campaign, a
        window something was happening. It draws <strong>behind</strong> the series, so the data reads on top. Omit{' '}
        <code>to</code> (or pass <code>'now'</code>) for an open-ended band that runs to the right edge — flip{' '}
        <em>ongoing</em> above the chart to see it.
      </>
    ),
    code: `<TimeRegion from={fromMs} to={toMs ?? 'now'} fill="rgba(240,85,106,0.1)" label="window" />`,
  },
  {
    heading: '03 — REFERENCE LINES: DRAW A LEVEL',
    body: (
      <>
        A <code>&lt;ReferenceLine&gt;</code> is a straight line across the plot — a horizontal level pinned to a{' '}
        <code>value</code> (baseline, target, limit), or a vertical boundary pinned to a <code>time</code> (mutually
        exclusive). It draws <strong>above</strong> the series so a threshold reads on top of the data.{' '}
        <code>style</code> is <code>'solid' | 'dashed'</code>.
      </>
    ),
    code: `// horizontal level\n<ReferenceLine value={70} label="limit 70" color="#f0a83c" />\n\n// vertical boundary in time\n<ReferenceLine time={deployMs} label="deploy v2.1.0" color="#cba6f7" />`,
  },
  {
    heading: '04 — OUT OF THE SERIES MODEL',
    body: (
      <>
        All three are annotations, not data: <strong>excluded from the tooltip, legend, and Y-range autoscale</strong>,
        and they never pollute series queries. Prop sets are identical across React, Vue, and Svelte (parity-checked in
        CI), each with imperative core equivalents — <code>addMarker</code>, <code>addRegion</code>,{' '}
        <code>addLine</code> (plus <code>update*</code> / <code>remove*</code>) — the same methods the components call
        under the hood.
      </>
    ),
    code: `chart.addMarker({ time: peakMs, seriesId: 'metric', label: 'peak', pulse: true });\nchart.addRegion({ from: fromMs, to: 'now', label: 'window' });\nchart.addLine({ value: 70, label: 'limit 70', color: '#f0a83c' });\nchart.addLine({ time: deployMs, label: 'deploy v2.1.0', color: '#cba6f7' });`,
  },
];

export function AnnotationsPage({ theme }: { theme: ChartTheme }) {
  const muted = hexToRgba(theme.tooltip.textColor, 0.7);

  const left = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1, minHeight: 0 }}>
      <div style={{ fontSize: theme.typography.fontSize, lineHeight: 1.55, color: theme.tooltip.textColor }}>
        <p style={{ margin: 0 }}>
          Three ways to annotate any chart on one canvas: markers pin the moments, a region shades the window, and
          reference lines draw the baseline, the limit, and the deploy that set it off.
        </p>
        <p style={{ margin: '8px 0 0', color: muted }}>
          Change the marker shape, or toggle the window between ongoing and settled.
        </p>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 320,
          maxHeight: 460,
          border: `1px solid ${theme.tooltip.borderColor}`,
          borderRadius: 8,
          overflow: 'hidden',
          padding: 12,
        }}
      >
        <AnnotationsDemo theme={theme} />
      </div>
    </div>
  );

  return (
    <AdvancedLayout
      theme={theme}
      framedChart={false}
      lead={
        <>
          Annotations turn a bare series into a story — pin the moments that matter, shade the intervals, and draw the
          levels, all without leaking into the tooltip, legend, or Y-range.
        </>
      }
      chart={left}
      steps={STEPS}
    />
  );
}
