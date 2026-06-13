import type { ChartTheme } from '@wick-charts/react';

import { AdvancedLayout, type Step } from '../../components/AdvancedLayout';
import { hexToRgba } from '../../utils';
import { EventMarkersDemo } from './event-markers.example';

const STEPS: Step[] = [
  {
    heading: '01 — A POINT, NOT A SERIES',
    body: (
      <>
        Monitoring charts constantly need to pin a <em>moment</em> — "anomaly opened", "deploy shipped", "alert
        resolved". A <code>&lt;Marker&gt;</code> does exactly that. Unlike a one-point fake series, it is{' '}
        <strong>excluded from the tooltip, legend, and Y-range autoscale</strong> and never pollutes series queries. It
        draws on the overlay layer, clipped to the plot area.
      </>
    ),
    code: `<LineSeries id="metric" data={metric} />\n<Marker time={openedMs} seriesId="metric" shape="arrow-down" pulse label="anomaly" color="#f0556a" />`,
  },
  {
    heading: '02 — ANCHOR BY VALUE, OR SNAP TO A SERIES',
    body: (
      <>
        Give the marker an explicit <code>value</code> to pin an exact Y, <strong>or</strong> pass a{' '}
        <code>seriesId</code> and omit <code>value</code> — the marker snaps to that series' nearest data point at{' '}
        <code>time</code>. The three markers in the demo all snap to the metric line, so they ride the curve without any
        hand-computed Y.
      </>
    ),
    code: `// explicit Y\n<Marker time={deployMs} value={42} label="deploy" />\n\n// snap Y to the series value at \`time\`\n<Marker time={deployMs} seriesId="metric" label="deploy" />`,
  },
  {
    heading: '03 — SHAPE, PULSE & LABEL',
    body: (
      <>
        <code>shape</code> is <code>'dot' | 'circle' | 'arrow-up' | 'arrow-down'</code> (arrows point their tip at the
        anchor). <code>pulse</code> reuses the live line halo, so an open incident reads as "still firing".{' '}
        <code>label</code> draws a text pill next to the glyph, and <code>color</code> overrides the accent. Flip the
        controls above the chart to see the anomaly marker change live.
      </>
    ),
    code: `<Marker\n  time={openedMs}\n  seriesId="metric"\n  shape="arrow-down"\n  pulse\n  label="anomaly"\n  color="#f0556a"\n/>`,
  },
  {
    heading: '04 — SAME API EVERYWHERE',
    body: (
      <>
        The prop set is identical across React, Vue, and Svelte (parity-checked in CI). Need imperative control? The
        chart instance exposes <code>addMarker(config)</code>, <code>updateMarker(id, config)</code>, and{' '}
        <code>removeMarker(id)</code> — the same methods the component calls under the hood.
      </>
    ),
    code: `const id = chart.addMarker({ time, seriesId: 'metric', label: 'anomaly', pulse: true });\nchart.updateMarker(id, { time, seriesId: 'metric', label: 'recovered', color: '#46b78f' });\nchart.removeMarker(id);`,
  },
];

export function EventMarkersPage({ theme }: { theme: ChartTheme }) {
  const muted = hexToRgba(theme.tooltip.textColor, 0.7);

  const left = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1, minHeight: 0 }}>
      <div style={{ fontSize: theme.typography.fontSize, lineHeight: 1.55, color: theme.tooltip.textColor }}>
        <p style={{ margin: 0 }}>
          An anomaly has a story: a deploy went out, a metric broke, and it recovered. Markers pin each moment to the
          line — snapped to the series value at that time, so they ride the curve.
        </p>
        <p style={{ margin: '8px 0 0', color: muted }}>
          Use the controls to change the anomaly marker's shape and toggle its pulse halo.
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
        <EventMarkersDemo theme={theme} />
      </div>
    </div>
  );

  return (
    <AdvancedLayout
      theme={theme}
      framedChart={false}
      lead={
        <>
          Event markers turn a bare metric line into an incident timeline — pin the moment something happened and label
          it, without it leaking into the tooltip, legend, or Y-range.
        </>
      }
      chart={left}
      steps={STEPS}
    />
  );
}
