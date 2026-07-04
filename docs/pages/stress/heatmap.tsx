import { type ReactNode, useEffect, useMemo, useState } from 'react';

import {
  ChartContainer,
  type ChartTheme,
  type HeatmapCellData,
  HeatmapSeries,
  type HeatmapSeriesOptions,
  HeatmapTooltip,
  type PerfConfig,
  Title,
} from '@wick-charts/react';

import { generateHeatmapGrid, poisonedHeatmapGrid, sparseHeatmapGrid } from '../../data/stress';
import type { PanelCtx, StressPanel } from './panel';

/**
 * Shared chart shell for heatmap panels — axes/grid off (the renderer draws
 * its own labels), tooltip always on so hover/hitTest paths stay exercised.
 */
function HeatmapCell({
  theme,
  perfHud,
  id,
  title,
  sub,
  data,
  options,
  children,
}: {
  theme: ChartTheme;
  perfHud: (() => PerfConfig) | undefined;
  id: string;
  title: string;
  sub: string;
  data: HeatmapCellData[];
  options?: Partial<HeatmapSeriesOptions>;
  children?: ReactNode;
}) {
  return (
    <ChartContainer
      theme={theme}
      perf={perfHud?.()}
      axis={{ y: { visible: false, width: 0 }, x: { visible: false, height: 0 } }}
      grid={{ visible: false }}
    >
      <Title sub={sub}>{title}</Title>
      <HeatmapSeries id={id} data={data} options={options} />
      <HeatmapTooltip seriesId={id} />
      {children}
    </ChartContainer>
  );
}

function Empty({ theme, perfHud }: PanelCtx) {
  const data = useMemo<HeatmapCellData[]>(() => [], []);

  return <HeatmapCell theme={theme} perfHud={perfHud} id="hm-empty" title="Empty" sub="data = []" data={data} />;
}

function SingleCell({ theme, perfHud }: PanelCtx) {
  const data = useMemo<HeatmapCellData[]>(() => [{ x: 'Q3', y: 'Revenue', value: 42 }], []);

  return (
    <HeatmapCell
      theme={theme}
      perfHud={perfHud}
      id="hm-single"
      title="Single cell"
      sub="1 × 1"
      data={data}
      options={{ cellLabels: true }}
    />
  );
}

function Poisoned({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => poisonedHeatmapGrid(), []);

  return (
    <HeatmapCell
      theme={theme}
      perfHud={perfHud}
      id="hm-poisoned"
      title="Poisoned values"
      sub="NaN · +Inf · −Inf on the diagonal"
      data={data}
      options={{ cellLabels: true }}
    />
  );
}

function Constant({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => generateHeatmapGrid({ cols: 6, rows: 4 }).map((cell) => ({ ...cell, value: 7 })), []);

  return (
    <HeatmapCell
      theme={theme}
      perfHud={perfHud}
      id="hm-constant"
      title="Constant value"
      sub="all cells = 7 → span 0"
      data={data}
      options={{ cellLabels: true }}
    />
  );
}

function Sparse({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => sparseHeatmapGrid(), []);

  return (
    <HeatmapCell
      theme={theme}
      perfHud={perfHud}
      id="hm-sparse"
      title="Sparse grid"
      sub="~40% cells missing"
      data={data}
    />
  );
}

function Duplicates({ theme, perfHud }: PanelCtx) {
  const data = useMemo<HeatmapCellData[]>(() => {
    const base = generateHeatmapGrid({ cols: 5, rows: 3, seed: 3 });

    // Same coordinate three times — the renderer must keep the last one.
    return [...base, { x: 'C2', y: 'R2', value: 1 }, { x: 'C2', y: 'R2', value: 50 }, { x: 'C2', y: 'R2', value: 99 }];
  }, []);

  return (
    <HeatmapCell
      theme={theme}
      perfHud={perfHud}
      id="hm-dupes"
      title="Duplicate coordinates"
      sub="C2·R2 supplied 4× — last wins (99)"
      data={data}
      options={{ cellLabels: true }}
    />
  );
}

function LargeGrid({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => generateHeatmapGrid({ cols: 52, rows: 24, seed: 8 }), []);

  return (
    <HeatmapCell
      theme={theme}
      perfHud={perfHud}
      id="hm-large"
      title="52 × 24"
      sub="1,248 cells"
      data={data}
      options={{ gap: 1, cornerRadius: 1 }}
    />
  );
}

const LONG_ROWS = [
  'p99 latency — worldwide, all regions aggregated',
  'checkout conversion (logged-in, EU, mobile)',
  'background sync failures per 10k sessions',
  'OK',
];

function LongLabels({ theme, perfHud }: PanelCtx) {
  const data = useMemo<HeatmapCellData[]>(() => {
    const cells: HeatmapCellData[] = [];
    for (let col = 0; col < 8; col++) {
      for (let row = 0; row < LONG_ROWS.length; row++) {
        cells.push({ x: `W${col + 1}`, y: LONG_ROWS[row], value: (col * 13 + row * 29) % 100 });
      }
    }

    return cells;
  }, []);

  return (
    <HeatmapCell
      theme={theme}
      perfHud={perfHud}
      id="hm-long-labels"
      title="Long row labels"
      sub="gutter reserve vs. grid space"
      data={data}
    />
  );
}

function DomainClamp({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => generateHeatmapGrid({ cols: 8, rows: 4, seed: 17 }), []);

  return (
    <HeatmapCell
      theme={theme}
      perfHud={perfHud}
      id="hm-clamp"
      title="Clamped domain"
      sub="data 0–100, min 0 / max 50"
      data={data}
      options={{ min: 0, max: 50, cellLabels: true }}
    />
  );
}

const CHURN_A = generateHeatmapGrid({ cols: 7, rows: 5, seed: 31 });
const CHURN_B = generateHeatmapGrid({ cols: 5, rows: 9, seed: 32 }).map((cell) => ({
  ...cell,
  x: cell.x.replace('C', 'K'),
  y: cell.y.replace('R', 'S'),
}));

function ShapeChurn({ theme, perfHud }: PanelCtx) {
  const [flip, setFlip] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setFlip((f) => !f), 3000);

    return () => clearInterval(timer);
  }, []);

  return (
    <HeatmapCell
      theme={theme}
      perfHud={perfHud}
      id="hm-churn"
      title="Grid shape churn"
      sub={flip ? '5 × 9 (K·S keys)' : '7 × 5 (C·R keys)'}
      data={flip ? CHURN_B : CHURN_A}
    />
  );
}

function LiveTween({ theme, perfHud }: PanelCtx) {
  const [tick, setTick] = useState(0);
  const data = useMemo(() => generateHeatmapGrid({ cols: 6, rows: 5, seed: 100 + tick }), [tick]);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 300);

    return () => clearInterval(timer);
  }, []);

  return (
    <HeatmapCell
      theme={theme}
      perfHud={perfHud}
      id="hm-live"
      title="Live tween under load"
      sub="same shape · new values every 300 ms"
      data={data}
      options={{ updateMs: 300, cellLabels: true }}
    />
  );
}

function ZeroAnimation({ theme, perfHud }: PanelCtx) {
  const data = useMemo(() => generateHeatmapGrid({ cols: 8, rows: 5, seed: 41 }), []);

  return (
    <HeatmapCell
      theme={theme}
      perfHud={perfHud}
      id="hm-zero-anim"
      title="Zero-duration animations"
      sub="entryMs 0 · updateMs 0"
      data={data}
      options={{ entryMs: 0, updateMs: 0 }}
    />
  );
}

function ExplicitGrid({ theme, perfHud }: PanelCtx) {
  const data = useMemo<HeatmapCellData[]>(
    () => [
      { x: 'A', y: 'R1', value: 10 },
      { x: 'B', y: 'R1', value: 40 },
      { x: 'C', y: 'R2', value: 70 },
      // Keys outside the explicit grid — must drop silently, not extend it.
      { x: 'D', y: 'R1', value: 100 },
      { x: 'A', y: 'R3', value: 100 },
    ],
    [],
  );

  return (
    <HeatmapCell
      theme={theme}
      perfHud={perfHud}
      id="hm-explicit"
      title="Explicit grid, stray data"
      sub="columns A·B·C, rows R1·R2 — D/R3 dropped"
      data={data}
      options={{ columns: ['A', 'B', 'C'], rows: ['R1', 'R2'], cellLabels: true }}
    />
  );
}

export const heatmapPanels: readonly StressPanel[] = [
  {
    id: 'heatmap-empty',
    title: 'Empty data',
    hint: 'No cells — render must early-return. No crash, no phantom label gutters.',
    render: (ctx) => <Empty {...ctx} />,
  },
  {
    id: 'heatmap-single',
    title: 'Single cell (1 × 1)',
    hint: 'One cell fills the plot. Hover lift and tooltip must cover the whole area.',
    render: (ctx) => <SingleCell {...ctx} />,
  },
  {
    id: 'heatmap-poisoned',
    title: 'NaN / ±Infinity values',
    hint: 'Non-finite cells pin to the low ramp stop and label as "—". Extent must ignore them — finite neighbors keep full contrast.',
    render: (ctx) => <Poisoned {...ctx} />,
  },
  {
    id: 'heatmap-constant',
    title: 'Constant value',
    hint: 'min == max → span 0. Every cell paints the low stop, tooltip meter reads 0% — no NaN in the ramp math.',
    render: (ctx) => <Constant {...ctx} />,
  },
  {
    id: 'heatmap-sparse',
    title: 'Sparse grid',
    hint: 'Holes in the matrix. Empty slots must not be hoverable — hitTest returns none between cells.',
    render: (ctx) => <Sparse {...ctx} />,
  },
  {
    id: 'heatmap-duplicates',
    title: 'Duplicate coordinates',
    hint: 'The same (x, y) supplied repeatedly. Last datum wins — one paint, no ghost tween from the stale value.',
    render: (ctx) => <Duplicates {...ctx} />,
  },
  {
    id: 'heatmap-large',
    title: '52 × 24 grid (1,248 cells)',
    hint: 'Entrance wave and hover at four-digit cell counts; column labels must thin instead of colliding.',
    render: (ctx) => <LargeGrid {...ctx} />,
    minHeight: 420,
  },
  {
    id: 'heatmap-long-labels',
    title: 'Long row labels',
    hint: 'Gutter is measured from the widest row key. The grid must survive the reserve; labels never overlap cells.',
    render: (ctx) => <LongLabels {...ctx} />,
  },
  {
    id: 'heatmap-domain-clamp',
    title: 'Clamped domain',
    hint: 'Explicit min/max narrower than the data. Out-of-domain values clamp to the end stops — no overshoot past the ramp.',
    render: (ctx) => <DomainClamp {...ctx} />,
  },
  {
    id: 'heatmap-shape-churn',
    title: 'Grid shape churn',
    hint: 'Swaps 7×5 ↔ 5×9 with disjoint keys every 3 s. The entrance wave replays, hover state resets, no stale cells linger.',
    render: (ctx) => <ShapeChurn {...ctx} />,
  },
  {
    id: 'heatmap-live-tween',
    title: 'Live tween under load',
    hint: 'Same-shape data every 300 ms with updateMs 300 — values chase continuously; colors morph, never snap. Watch the HUD for a settled RAF between ticks.',
    render: (ctx) => <LiveTween {...ctx} />,
  },
  {
    id: 'heatmap-zero-anim',
    title: 'Zero-duration animations',
    hint: 'entryMs 0 / updateMs 0. Instant paint, hover snaps without easing, and the RAF loop must go idle — no wave waiting forever.',
    render: (ctx) => <ZeroAnimation {...ctx} />,
  },
  {
    id: 'heatmap-explicit-grid',
    title: 'Explicit grid, stray data',
    hint: 'columns/rows options pin the grid; data with unknown keys must drop silently instead of growing the matrix.',
    render: (ctx) => <ExplicitGrid {...ctx} />,
  },
];
