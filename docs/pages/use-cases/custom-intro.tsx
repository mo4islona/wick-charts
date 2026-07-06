import type { ChartTheme } from '@wick-charts/react';

import { AdvancedLayout, type Step } from '../../components/AdvancedLayout';
import { CustomIntroDemo } from './custom-intro.example';
import source from './custom-intro.example.tsx?raw';

const STEPS: Step[] = [
  {
    heading: '01 — AN INTRO IS A FUNCTION',
    body: (
      <>
        The initial-load reveal isn't a preset you pick from — it's a <code>LineIntroFn</code> the renderer calls once
        per frame while the intro plays. It receives the frame (linear <code>progress</code> over the whole reveal
        window, the visible <code>range</code>, plot-area <code>width</code>/<code>height</code>, live{' '}
        <code>timeToX</code>/<code>xToTime</code>/<code>valueToY</code> scales, memoized data accessors) and returns
        directives — a declarative description of what the frame should look like. The renderer owns the drawing; your
        function owns the choreography. The shipped styles (<code>unfoldIntro</code>, <code>sweepIntro</code>,{' '}
        <code>traceIntro</code>, <code>plotterIntro</code>, <code>centerOutIntro</code>) are plain factories over this
        same contract, so a custom intro is their peer — not a second-class hook.
      </>
    ),
    code: `type LineIntroFn = (frame: LineIntroFrame) => LineIntroDirectives;\n\ninterface LineIntroDirectives {\n  clip?: { fromX?: number; toX?: number }; // reveal window, bitmap px\n  ghostAlpha?: number;                     // faint full-line pre-pass\n  heads?: Array<{ x: number; time: number }>; // glow dots on the front\n  value?: (args: LineIntroValueArgs) => number; // per-value transform\n}`,
  },
  {
    heading: '02 — SHAPE THE REVEAL WITH CLIP + HEADS',
    body: (
      <>
        This demo opens the line from its own peak outward, instead of from a fixed pane-relative point. It walks{' '}
        <code>frame.layerData(0)</code> once per frame to find the highest value's bitmap X, then computes a clip window
        centered on that anchor (a smoothstep over <code>progress</code>) — only pixels inside it are drawn — plus two{' '}
        <code>heads</code>. A head is an anchor <code>{'{ x, time }'}</code>: the renderer interpolates the series value
        at <code>time</code>, draws the same glowing pulse dot the live stream uses, and bell-fades it over the intro
        window. Omitted clip sides default to the pane edges, so <code>{'{ toX }'}</code> alone is a left-to-right sweep
        — that's the built-in <code>centerOutIntro()</code>, anchored at the fixed center instead of a data-driven
        point.
      </>
    ),
    code: `const peakOut: LineIntroFn = (frame) => {\n  let anchorX = frame.width / 2;\n  let peak = -Infinity;\n  for (const point of frame.layerData(0)) {\n    if (!Number.isFinite(point.value) || point.value <= peak) continue;\n    peak = point.value;\n    anchorX = frame.timeToX(point.time);\n  }\n\n  const eased = smoothstep(frame.progress);\n  const half = Math.max(anchorX, frame.width - anchorX) * eased;\n\n  return {\n    clip: { fromX: anchorX - half, toX: anchorX + half },\n    heads: [\n      { x: anchorX - half, time: frame.xToTime(anchorX - half) },\n      { x: anchorX + half, time: frame.xToTime(anchorX + half) },\n    ],\n  };\n};`,
  },
  {
    heading: '03 — OR TRANSFORM THE VALUES',
    body: (
      <>
        A clip is one kind of reveal; the <code>value</code> directive is the other. Return a function and every
        rendered value — stroke, area, stacked cumulative, the overlay pulse — flows through it. The default{' '}
        <code>unfoldIntro()</code> is nothing more than this: each point lerps from its layer's visible mean toward its
        real value with a soft overshoot, staggered left-to-right by the point's <code>position</code>. Frame accessors
        like <code>layerMean</code> and <code>primaryPath</code> are memoized per frame, so a directive function stays
        pure and cheap.
      </>
    ),
    code: `// The whole default intro, essentially:\nreturn {\n  value: ({ layerIndex, value, position }) => {\n    const mean = frame.layerMean(layerIndex);\n    if (mean === null) return value;\n\n    const local = clamp01((frame.progress - 0.35 * position) / 0.65);\n\n    return mean + (value - mean) * easeOutBack(local);\n  },\n};`,
  },
  {
    heading: '04 — HAND IT TO THE SERIES',
    body: (
      <>
        Pass the function to <code>introAnimation</code>; <code>introMs</code> controls the duration. The reference
        doesn't need to be memoized — the React wrapper latches the latest function behind a stable identity, so an
        inline definition costs nothing. (Hoisting a <em>stateful</em> factory to module scope is still a good habit: a
        factory re-created every render resets its closure state mid-intro.) The intro arms exactly once — on the first
        empty → non-empty data seed; bulk re-seeds of a live series never replay it, and it's skipped entirely under{' '}
        <code>prefers-reduced-motion</code>. That's why the Replay button remounts the chart: a fresh mount is the same
        transition a real page load goes through.
      </>
    ),
    code: `<LineSeries\n  data={data}\n  options={{ introAnimation: peakOut, introMs: 700 }}\n/>`,
  },
  {
    heading: '05 — BARS AND CANDLES, SAME IDEA',
    body: (
      <>
        Bar and candlestick series expose mirror contracts — <code>BarIntroFn</code> and <code>CandleIntroFn</code> —
        with per-element directives instead of a path clip: each element gets an eased, left-to-right staggered{' '}
        <code>progress</code>, and you return how it enters — a <code>value</code> scale (growth from the baseline,
        stacking-safe) and an <code>element</code> transform (translation, alpha). The shipped styles are factories over
        the same shapes (<code>growIntro</code>, <code>springIntro</code>, <code>candleUnfoldIntro</code>,{' '}
        <code>wickBodyIntro</code>, and the shared <code>riseIntro</code>/<code>fadeIntro</code>/<code>wipeIntro</code>
        ), so everything in this walkthrough carries over element-wise.
      </>
    ),
    code: `const shy: BarIntroFn = () => ({\n  value: ({ value, progress }) => value * progress, // grow up\n  element: (el) => ({ alpha: 0.3 + 0.7 * el.progress }), // …fading in\n});\n\n<BarSeries data={data} options={{ introAnimation: shy }} />`,
  },
];

export function CustomIntroPage({ theme }: { theme: ChartTheme }) {
  return (
    <AdvancedLayout
      theme={theme}
      source={source}
      lead={
        <>
          Every series plays an intro the first time it receives data, and the choreography is pluggable: a small
          function that reads the frame and returns declarative directives, while the engine keeps owning scales, data
          and drawing. Here we hand-write one — a reveal that opens from the line's own peak outward, a glowing head
          riding each front — and walk the whole contract.
        </>
      }
      chart={
        <div style={{ flex: 1, minHeight: 320, maxHeight: 480 }}>
          <CustomIntroDemo theme={theme} />
        </div>
      }
      steps={STEPS}
    />
  );
}
