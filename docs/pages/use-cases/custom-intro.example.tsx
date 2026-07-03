import { type ReactNode, useMemo, useState } from 'react';

import { ChartContainer, type ChartTheme, type LineIntroFn, LineSeries, XAxis, YAxis } from '@wick-charts/react';

import { generateLineData } from '../../data';

// The custom intro. A LineIntroFn runs once per frame while the intro plays:
// it reads the frame (progress, visible range, pane size, scales, data
// accessors) and returns directives describing what this frame should look
// like — the renderer does the drawing. Here the reveal opens from the
// center of the pane outward, a glowing head riding each front. Hoisted to
// module scope so the reference stays stable across re-renders.
const centerOut: LineIntroFn = (frame) => {
  // Smoothstep easing — gentle in/out without importing an easing helper.
  const eased = frame.progress * frame.progress * (3 - 2 * frame.progress);
  const cx = frame.width / 2;
  const half = cx * eased;

  // Heads carry a `time` so the renderer can look up the Y value the head
  // should sit on; map the two front X positions back into the time domain.
  const toTime = (x: number) => frame.range.from + (x / frame.width) * (frame.range.to - frame.range.from);

  return {
    clip: { fromX: cx - half, toX: cx + half },
    heads: [
      { x: cx - half, time: toTime(cx - half) },
      { x: cx + half, time: toTime(cx + half) },
    ],
  };
};

export function CustomIntroDemo({ theme }: { theme: ChartTheme }): ReactNode {
  const data = useMemo(() => generateLineData(120, 140), []);
  // The intro arms exactly once per series lifetime — on the first
  // empty → non-empty data seed. Remounting the chart (the `key` below)
  // re-creates that transition, which is what the replay button does.
  const [epoch, setEpoch] = useState(0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <button
        type="button"
        onClick={() => setEpoch((current) => current + 1)}
        style={{
          alignSelf: 'flex-start',
          padding: '6px 16px',
          borderRadius: 8,
          border: `1px solid ${theme.tooltip.borderColor}`,
          background: 'transparent',
          color: theme.axis.textColor,
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        ▶ Replay
      </button>

      <div style={{ flex: 1, minHeight: 0 }}>
        <ChartContainer key={epoch} theme={theme}>
          <LineSeries data={data} options={{ introAnimation: centerOut, introMs: 700 }} />
          <YAxis />
          <XAxis />
        </ChartContainer>
      </div>
    </div>
  );
}
