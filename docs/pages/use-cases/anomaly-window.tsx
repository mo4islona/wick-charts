import type { ChartTheme } from '@wick-charts/react';

import { AdvancedLayout, type Step } from '../../components/AdvancedLayout';
import { hexToRgba } from '../../utils';
import { AnomalyWindowDemo } from './anomaly-window.example';

const STEPS: Step[] = [
  {
    heading: '01 — SHADE THE WINDOW',
    body: (
      <>
        An anomaly has a <em>window</em>, not just a moment: from when it broke to when it recovered. A{' '}
        <code>&lt;TimeRegion&gt;</code> shades that interval with a translucent band — Grafana's annotation region,
        TradingView's highlighted session. Like markers, it stays <strong>out of the series model</strong>: no effect on
        the Y-range autoscale, tooltip, or legend. It draws on the main layer <strong>behind</strong> the series, so the
        data reads on top of the shading.
      </>
    ),
    code: `<TimeRegion from={brokeMs} to={recoveredMs} fill="rgba(240,85,106,0.1)" label="incident" />`,
  },
  {
    heading: '02 — OPEN-ENDED “STILL FIRING”',
    body: (
      <>
        Omit <code>to</code> (or pass <code>'now'</code>) and the band becomes open-ended — it extends to the right edge
        of the plot, the "still firing" case. Flip the control above the chart: while firing, the band runs to the edge
        and the <code>broke</code> marker pulses; once recovered, the band closes at the recovery time and a{' '}
        <code>recovered</code> dot appears.
      </>
    ),
    code: `<TimeRegion from={brokeMs} to={recoveredMs ?? 'now'} fill="rgba(240,85,106,0.1)" label="incident" />`,
  },
  {
    heading: '03 — REFERENCE LINES',
    body: (
      <>
        A <code>&lt;ReferenceLine&gt;</code> is a straight line across the plot — a horizontal threshold / baseline
        pinned to a <code>value</code>, or a vertical event boundary pinned to a <code>time</code> (mutually exclusive).
        The demo draws a <strong>baseline</strong> and an <strong>alert</strong> threshold horizontally, and the{' '}
        <strong>deploy</strong> that preceded the spike as a vertical line. They render on the overlay,{' '}
        <strong>above</strong> the series, so a threshold reads on top of the data the way it should.
      </>
    ),
    code: `// horizontal — threshold / baseline\n<ReferenceLine value={70} label="alert 70" color="#f0a83c" />\n\n// vertical — event boundary in time\n<ReferenceLine time={deployMs} label="deploy v2.1.0" color="#6f9ef8" />`,
  },
  {
    heading: '04 — SAME API EVERYWHERE',
    body: (
      <>
        Both components share an identical prop set across React, Vue, and Svelte (parity-checked in CI). Need
        imperative control? The chart instance exposes <code>addRegion / updateRegion / removeRegion</code> and{' '}
        <code>addLine / updateLine / removeLine</code> — the same methods the components call under the hood.
      </>
    ),
    code: `const id = chart.addRegion({ from: brokeMs, to: 'now', label: 'incident' });\nchart.updateRegion(id, { from: brokeMs, to: recoveredMs, label: 'incident' });\n\nchart.addLine({ value: 70, label: 'alert 70', color: '#f0a83c' });\nchart.addLine({ time: deployMs, label: 'deploy v2.1.0', color: '#6f9ef8' });`,
  },
];

export function AnomalyWindowPage({ theme }: { theme: ChartTheme }) {
  const muted = hexToRgba(theme.tooltip.textColor, 0.7);

  const left = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1, minHeight: 0 }}>
      <div style={{ fontSize: theme.typography.fontSize, lineHeight: 1.55, color: theme.tooltip.textColor }}>
        <p style={{ margin: 0 }}>
          The same incident as the markers demo, told with shading and lines: a band over the window the metric was
          broken, a baseline and an alert threshold, and the deploy that set it off.
        </p>
        <p style={{ margin: '8px 0 0', color: muted }}>
          Toggle the incident state to see the open-ended band and pulsing marker collapse into a closed window.
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
        <AnomalyWindowDemo theme={theme} />
      </div>
    </div>
  );

  return (
    <AdvancedLayout
      theme={theme}
      framedChart={false}
      lead={
        <>
          Time regions and reference lines turn a metric line into an annotated incident — shade the window something
          was broken, mark the thresholds it crossed, and pin the deploy that set it off.
        </>
      }
      chart={left}
      steps={STEPS}
    />
  );
}
