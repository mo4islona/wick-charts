import { type ReactNode, useMemo, useState } from 'react';

import {
  ChartContainer,
  type ChartTheme,
  type LineIntroFn,
  LineSeries,
  type TimePoint,
  XAxis,
  YAxis,
  sweepIntro,
  traceIntro,
  unfoldIntro,
} from '@wick-charts/react';

import { generateLineData } from '../../data';

// Design-review page (same spirit as y-value-badge.tsx): the line-series
// intro styles side by side, on identical data, with a replay button. The
// built-ins come straight from the public factory API; the last panel is a
// fully custom LineIntroFn to prove the override contract. NOT meant to be
// published as a use case.

/**
 * Custom intro built on the public contract: the reveal opens from the
 * center outward, with a head riding each front.
 */
const centerOut: LineIntroFn = (frame) => {
  // Smoothstep — gentle in/out without importing an easing.
  const t = frame.progress * frame.progress * (3 - 2 * frame.progress);
  const cx = frame.width / 2;
  const half = cx * t;

  const leftTime = frame.range.from + ((cx - half) / frame.width) * (frame.range.to - frame.range.from);
  const rightTime = frame.range.from + ((cx + half) / frame.width) * (frame.range.to - frame.range.from);

  return {
    clip: { fromX: cx - half, toX: cx + half },
    heads: [
      { x: cx - half, time: leftTime },
      { x: cx + half, time: rightTime },
    ],
  };
};

interface Variant {
  id: string;
  intro: LineIntroFn;
  title: string;
  blurb: string;
}

const VARIANTS: Variant[] = [
  {
    id: 'sweep',
    intro: sweepIntro(),
    title: 'Sweep — sweepIntro() (default)',
    blurb: 'Left-to-right draw-on behind a clip edge; glowing head rides the front.',
  },
  {
    id: 'unfold',
    intro: unfoldIntro(),
    title: 'Unfold — unfoldIntro()',
    blurb: 'The line is visible at once, flat at its mean — amplitude springs into shape with a soft overshoot.',
  },
  {
    id: 'trace',
    intro: traceIntro(),
    title: 'Trace — traceIntro()',
    blurb: 'Faint ghost of the whole line appears instantly; an ink pass sweeps across and fills the area.',
  },
  {
    id: 'center-out',
    intro: centerOut,
    title: 'Custom — center-out LineIntroFn',
    blurb: 'A hand-written intro function using the public contract: clip window opens from the center, two heads.',
  },
];

function Panel({
  variant,
  data,
  theme,
  epoch,
}: {
  variant: Variant;
  data: TimePoint[];
  theme: ChartTheme;
  epoch: number;
}): ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 420px', minWidth: 380 }}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: theme.axis.textColor }}>{variant.title}</div>
        <div style={{ fontSize: 12, opacity: 0.7, color: theme.axis.textColor }}>{variant.blurb}</div>
      </div>
      <div
        style={{
          height: 280,
          border: `1px solid ${theme.tooltip.borderColor}`,
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        {/* Remounting on epoch change re-seeds the series empty → non-empty,
            which is exactly the condition that arms the intro. */}
        <ChartContainer key={`${variant.id}-${epoch}`} theme={theme}>
          <LineSeries data={data} options={{ introAnimation: variant.intro, introMs: 700 }} />
          <YAxis />
          <XAxis />
        </ChartContainer>
      </div>
    </div>
  );
}

export function LineIntroPage({ theme }: { theme: ChartTheme }): ReactNode {
  const [epoch, setEpoch] = useState(0);
  const data = useMemo(() => generateLineData(90, 140), []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          type="button"
          onClick={() => setEpoch((e) => e + 1)}
          style={{
            padding: '8px 18px',
            borderRadius: 8,
            border: `1px solid ${theme.tooltip.borderColor}`,
            background: 'transparent',
            color: theme.axis.textColor,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          ▶ Replay intros
        </button>
        <span style={{ fontSize: 12, opacity: 0.6, color: theme.axis.textColor }}>
          Same data in every panel; introMs: 700. Also built in: plotterIntro().
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {VARIANTS.map((variant) => (
          <Panel key={variant.id} variant={variant} data={data} theme={theme} epoch={epoch} />
        ))}
      </div>
    </div>
  );
}
