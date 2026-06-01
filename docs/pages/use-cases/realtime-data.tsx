import { useMemo, useState } from 'react';

import type { ChartTheme } from '@wick-charts/react';

import { AdvancedLayout, type Step } from '../../components/AdvancedLayout';
import { generateOHLCData } from '../../data';
import { hexToRgba } from '../../utils';
import { RealtimeDataDemo } from './realtime-data.example';

type Mode = 'declarative' | 'imperative';

const COUNT = 60;
const INTERVAL = 60_000 * 60;

const DECLARATIVE_STEPS: Step[] = [
  {
    heading: '01 — UPDATE THE DATA PROP',
    body: (
      <>
        Keep the series array in state and pass it to the series <code>data</code> prop. On every change the wrapper
        diffs the new array against the previous one and picks the cheapest mutation — append, update-in-place, roll, or
        bulk-replace. The chart on the left runs exactly this.
      </>
    ),
    code: `const [data, setData] = useState(seed);\n\nuseEffect(() => {\n  const id = setInterval(() => {\n    setData((prev) => [...prev, nextBar(prev)].slice(-120));\n  }, 1000);\n\n  return () => clearInterval(id);\n}, []);\n\nreturn <CandlestickSeries id="price" data={data} />;`,
  },
  {
    heading: '02 — APPEND A BAR vs UPDATE THE FORMING ONE',
    body: (
      <>
        The diff keys on timestamps. A point with a <strong>new</strong> time is appended — a fresh candle with its
        entrance animation. Replacing the <strong>last</strong> point (same time, new OHLC) updates it in place, the
        body and wick easing over <code>smoothMs</code>. A feed updates the forming bar each tick, then appends when it
        closes.
      </>
    ),
    code: `setData((prev) => {\n  const last = prev[prev.length - 1];\n\n  // same timestamp → update in place (eases via smoothMs)\n  if (sameBar)\n    return [...prev.slice(0, -1), { ...last, high, low, close }];\n\n  // new timestamp → append (entrance animation)\n  return [...prev, { time: last.time + interval, open: last.close, high, low, close }];\n});`,
  },
  {
    heading: '03 — ROLLING WINDOW & AUTO-SCROLL',
    body: (
      <>
        Cap the buffer with <code>.slice(-n)</code>. Unlike a full <code>setSeriesData</code>, trimming eases the Y axis
        instead of snapping, so the window rolls without jitter. Auto-scroll keeps the newest bar pinned to the right
        until the reader pans away. The same <code>data</code> prop drives Vue and Svelte.
      </>
    ),
  },
];

const IMPERATIVE_STEPS: Step[] = [
  {
    heading: '01 — GRAB THE INSTANCE',
    body: (
      <>
        Get the chart with <code>useChartInstance()</code> (or a ref). These are the same methods the declarative layer
        calls under the hood, so you can mix them freely with the <code>data</code> prop.
      </>
    ),
    code: `const chart = useChartInstance();`,
  },
  {
    heading: '02 — appendData / updateData / keepLast',
    body: (
      <>
        <code>appendData(id, point)</code> adds a new bar; <code>updateData(id, point)</code> replaces the forming one
        in place (eases over <code>smoothMs</code>); <code>keepLast(id, n)</code> trims to a rolling window. No array
        copies, no reconciliation — straight to the canvas.
      </>
    ),
    code: `socket.onTick((t) => {\n  if (t.barClosed) chart.appendData('price', t.candle);\n  else chart.updateData('price', t.candle);\n  chart.keepLast('price', 500); // rolling window\n});`,
  },
  {
    heading: '03 — WHEN IT WINS',
    body: (
      <>
        Reach for the imperative path when ticks arrive faster than you want React to render, when the data lives
        outside the component tree, or when you need exact control over append-vs-update. Identical methods in Vue and
        Svelte.
      </>
    ),
  },
];

function ModeToggle({ theme, mode, onMode }: { theme: ChartTheme; mode: Mode; onMode: (next: Mode) => void }) {
  const muted = hexToRgba(theme.tooltip.textColor, 0.7);
  const border = hexToRgba(theme.tooltip.textColor, 0.18);
  const tabs: Array<{ id: Mode; label: string }> = [
    { id: 'declarative', label: 'Declarative' },
    { id: 'imperative', label: 'Imperative' },
  ];

  return (
    <div
      role="tablist"
      aria-label="Streaming approach"
      style={{
        display: 'inline-flex',
        alignSelf: 'flex-start',
        border: `1px solid ${border}`,
        borderRadius: 6,
        overflow: 'hidden',
        fontSize: theme.typography.fontSize - 1,
      }}
    >
      {tabs.map((tab) => {
        const active = tab.id === mode;

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onMode(tab.id)}
            style={{
              padding: '6px 16px',
              border: 'none',
              background: active ? hexToRgba(theme.tooltip.textColor, 0.08) : 'transparent',
              color: active ? theme.tooltip.textColor : muted,
              cursor: 'pointer',
              fontFamily: theme.typography.fontFamily,
              fontSize: 'inherit',
              fontWeight: active ? 500 : 400,
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function RealtimeDataPage({ theme }: { theme: ChartTheme }) {
  const seed = useMemo(() => generateOHLCData(COUNT, 100, INTERVAL), []);
  const [mode, setMode] = useState<Mode>('declarative');
  const muted = hexToRgba(theme.tooltip.textColor, 0.7);
  const steps = mode === 'declarative' ? DECLARATIVE_STEPS : IMPERATIVE_STEPS;

  // The left column doubles as the intro and the mode switcher: a short primer
  // on the two approaches, the Declarative/Imperative toggle, and the live
  // chart. Flipping the toggle swaps the walkthrough on the right.
  const left = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1, minHeight: 0 }}>
      <div style={{ fontSize: theme.typography.fontSize, lineHeight: 1.55, color: theme.tooltip.textColor }}>
        <p style={{ margin: '0 0 8px' }}>Two ways to push live ticks in — pick one to walk through it:</p>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <li>
            <strong>Declarative</strong> — keep the series in state and hand it to the <code>data</code> prop; the
            wrapper diffs it and appends, updates, or rolls the window for you.
          </li>
          <li>
            <strong>Imperative</strong> — call <code>appendData</code> / <code>updateData</code> / <code>keepLast</code>{' '}
            on the chart instance directly.
          </li>
        </ul>
        <p style={{ margin: '8px 0 0', color: muted }}>
          Default to declarative; reach for imperative when ticks outrun your render loop or the data lives outside the
          component tree.
        </p>
      </div>

      <ModeToggle theme={theme} mode={mode} onMode={setMode} />

      <div
        style={{
          flex: 1,
          minHeight: 280,
          maxHeight: 440,
          border: `1px solid ${theme.tooltip.borderColor}`,
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <RealtimeDataDemo theme={theme} seed={seed} />
      </div>
    </div>
  );

  return (
    <AdvancedLayout
      theme={theme}
      framedChart={false}
      lead={
        <>
          A chart should absorb live ticks without remounting — repainting the canvas at 60fps in React, Vue or Svelte.
          There are two ways to feed it; pick one on the left to see its walkthrough.
        </>
      }
      chart={left}
      steps={steps}
    />
  );
}
