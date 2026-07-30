import { useState } from 'react';

import type { ChartTheme, MarkerShape } from '@wick-charts/react';

import { AdvancedLayout, type Step } from '../../components/AdvancedLayout';
import { Segmented, ToggleChip } from '../../components/kit';
import { AnnotationsDemo } from './annotations.example';
import source from './annotations.example.tsx?raw';

const SHAPES: MarkerShape[] = ['arrow-down', 'dot', 'circle', 'arrow-up'];

const STEPS: Step[] = [
  {
    heading: '01 — MARKERS: PIN A MOMENT',
    body: (
      <>
        A <code>&lt;Marker&gt;</code> pins a single moment to the chart — "deploy shipped", "peak", "released". Give it
        an explicit <code>value</code>, <strong>or</strong> a <code>seriesId</code> and it snaps to that series' value
        at <code>time</code>, riding the curve. <code>label</code> draws a callout chip whose tail points at the anchor.
        The tail replaces an arrow glyph — a labeled <code>arrow-down</code> floats the callout above the anchor,{' '}
        <code>arrow-up</code> below it — while <code>dot</code> / <code>circle</code> keep their glyph under the
        callout. Bare markers draw the raw glyph; flip <em>labels</em> off above the chart to compare.{' '}
        <code>pulse</code> reuses the live line halo.
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
  const [shape, setShape] = useState<MarkerShape>('arrow-down');
  const [ongoing, setOngoing] = useState(false);
  const [labeled, setLabeled] = useState(true);

  return (
    <AdvancedLayout
      theme={theme}
      source={source}
      lead={
        <>
          <p style={{ margin: 0 }}>
            Annotations turn a bare series into a story — markers pin the moments that matter, a region shades the
            window, and reference lines draw the baseline, the limit, and the deploy that set it off — all without
            leaking into the tooltip, legend, or Y-range.
          </p>
          <p style={{ margin: '8px 0 0' }}>
            Change the marker shape, strip the labels down to bare glyphs, or toggle the window between ongoing and
            settled.
          </p>
        </>
      }
      chartControls={
        <>
          <span>Marker shape:</span>
          <Segmented<MarkerShape>
            theme={theme}
            value={shape}
            onChange={setShape}
            ariaLabel="Marker shape"
            options={SHAPES.map((s) => ({ value: s, label: s }))}
          />
          <ToggleChip theme={theme} pressed={labeled} onToggle={setLabeled}>
            {labeled ? 'labels — callout chips' : 'no labels — bare glyphs'}
          </ToggleChip>
          <ToggleChip theme={theme} pressed={ongoing} onToggle={setOngoing} accent="#f0556a">
            {ongoing ? 'ongoing — band to edge' : 'settled — band closed'}
          </ToggleChip>
        </>
      }
      chart={<AnnotationsDemo theme={theme} shape={shape} ongoing={ongoing} labeled={labeled} />}
      mobileChartHeight={380}
      steps={STEPS}
    />
  );
}
