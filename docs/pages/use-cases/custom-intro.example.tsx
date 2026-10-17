import { type ReactNode, useMemo } from 'react';

import { ChartContainer, type ChartTheme, type LineIntroFn, LineSeries, XAxis, YAxis } from '@wick-charts/react';

import { generateLineData } from '../../data';
import { Sparkler, SparklerOverlay, sparklerColors } from './sparkler/SparklerOverlay';

// The custom intro. A LineIntroFn runs once per frame while the intro plays:
// it reads the frame (progress, visible range, pane size, scales, data
// accessors) and returns directives describing what this frame should look
// like — the renderer does the drawing. Here the reveal opens from the
// line's own peak outward rather than a fixed pane-relative point, a glowing
// head riding each front. Module scope keeps it out of the component; an
// inline definition works too — the React wrapper latches the function, so
// the reference doesn't need memoizing.
const peakOut: LineIntroFn = (frame) => {
  // Walk the first layer's visible data to find the peak's bitmap X —
  // frame.layerData is memoized per frame, so this is cheap to redo per tick.
  let anchorX = frame.width / 2;
  let peak = -Infinity;
  for (const point of frame.layerData(0)) {
    if (!Number.isFinite(point.value) || point.value <= peak) continue;
    peak = point.value;
    anchorX = frame.timeToX(point.time);
  }

  // Smoothstep easing — gentle in/out without importing an easing helper.
  const eased = frame.progress * frame.progress * (3 - 2 * frame.progress);
  const half = Math.max(anchorX, frame.width - anchorX) * eased;

  // Heads carry a `time` so the renderer can look up the Y value the head
  // should sit on; `frame.xToTime` maps the two front X positions back into
  // the time domain through the live time scale.
  return {
    clip: { fromX: anchorX - half, toX: anchorX + half },
    heads: [
      { x: anchorX - half, time: frame.xToTime(anchorX - half) },
      { x: anchorX + half, time: frame.xToTime(anchorX + half) },
    ],
  };
};

// The same reveal without heads, for the fill underlay: it opens in step with
// the line without drawing a second pair of glow dots.
const peakOutClipOnly: LineIntroFn = (frame) => ({ clip: peakOut(frame).clip });

/** Bitmap Y of the drawn line at bitmap `x`, interpolated between its points. */
function pathYAt(path: ReadonlyArray<{ x: number; y: number }>, x: number): number {
  const first = path[0];
  if (x <= first.x) return first.y;

  for (let i = 1; i < path.length; i++) {
    const right = path[i];
    if (right.x < x) continue;

    const left = path[i - 1];
    const t = right.x === left.x ? 0 : (x - left.x) / (right.x - left.x);

    return left.y + (right.y - left.y) * t;
  }

  return path[path.length - 1].y;
}

// The intro fn is the one place that knows where the reveal fronts are on
// every frame, so it can feed them to anything else. This wrapper leaves
// peakOut's directives untouched and hands each head to the sparkler — as a
// fraction of the plot area, so the overlay never deals in bitmap pixels.
function withSparks(intro: LineIntroFn, sparkler: Sparkler): LineIntroFn {
  return (frame) => {
    const directives = intro(frame);
    const path = frame.primaryPath();
    if (path === null || directives.heads === undefined) return directives;

    sparkler.feed({
      progress: frame.progress,
      heads: directives.heads.map((head) => ({
        x: head.x / frame.width,
        y: pathYAt(path, head.x) / frame.height,
      })),
    });

    return directives;
  };
}

// The intro arms exactly once per series lifetime — on the first
// empty → non-empty data seed. Remounting the demo (the page passes a
// fresh `key` on Replay) re-creates that transition, and a fresh sparkler.
export function CustomIntroDemo({ theme }: { theme: ChartTheme }): ReactNode {
  const data = useMemo(() => generateLineData(120, 140), []);
  const sparkler = useMemo(() => new Sparkler(), []);
  const intro = useMemo(() => withSparks(peakOut, sparkler), [sparkler]);

  // The line burns in the sparks' colors: orange, turning gold above the
  // midpoint of its range.
  const fire = sparklerColors(theme);
  const midpoint = useMemo(() => {
    const values = data.map((point) => point.value);

    return (Math.min(...values) + Math.max(...values)) / 2;
  }, [data]);

  // The threshold paints the fill too, at a fixed strength that is too loud on
  // a dark page; there a stroke-less series underneath draws a fainter fill.
  return (
    <ChartContainer theme={theme}>
      {fire.underlay !== null && (
        <LineSeries
          data={{ label: 'Glow', color: fire.underlay, data }}
          options={{ introAnimation: peakOutClipOnly, introMs: 1400, strokeWidth: 0, pulse: false }}
        />
      )}
      <LineSeries
        data={{ label: 'Sparkler', color: fire.color, data }}
        options={{
          introAnimation: intro,
          introMs: 1400,
          strokeWidth: 2,
          area: { visible: fire.underlay === null },
          threshold: { value: midpoint, above: fire.hot },
        }}
      />
      <SparklerOverlay sparkler={sparkler} theme={theme} />
      <YAxis />
      <XAxis />
    </ChartContainer>
  );
}
