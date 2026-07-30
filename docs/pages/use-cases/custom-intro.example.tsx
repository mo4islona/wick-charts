import { type ReactNode, useMemo } from 'react';

import { ChartContainer, type ChartTheme, type LineIntroFn, LineSeries, XAxis, YAxis } from '@wick-charts/react';

import { generateLineData } from '../../data';

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

// The intro arms exactly once per series lifetime — on the first
// empty → non-empty data seed. Remounting the demo (the page passes a
// fresh `key` on Replay) re-creates that transition.
export function CustomIntroDemo({ theme }: { theme: ChartTheme }): ReactNode {
  const data = useMemo(() => generateLineData(120, 140), []);

  return (
    <ChartContainer theme={theme}>
      <LineSeries data={data} options={{ introAnimation: peakOut, introMs: 700 }} />
      <YAxis />
      <XAxis />
    </ChartContainer>
  );
}
