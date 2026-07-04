import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react';

import type { ChartTheme, PerfConfig, TransitionFactory, YRange } from '@wick-charts/react';

import { Cell } from '../../components/Cell';

// Charts mount only once their panel is within this margin of the viewport,
// and unmount again once they scroll back out — the continuous scrollspy
// layout puts all 71 scenarios on the page at once, so panels stay lazy the
// way the old tab-switched view kept only the active group mounted.
const MOUNT_MARGIN = '900px 0px 900px 0px';

function useNearViewport(ref: RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      rootMargin: MOUNT_MARGIN,
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, [ref]);

  return near;
}

export interface PanelCtx {
  theme: ChartTheme;
  /** `perf={true}` passes through to the panel's ChartContainer. */
  /** Per-chart perf config factory — call it per ChartContainer so each chart owns its monitor. */
  perfHud: (() => PerfConfig) | undefined;
  /** Y-bound transition factory. Panels that exercise streaming Y motion
   *  forward this through `ChartContainer.animations.axis.y.curve`.
   *  The stress page swaps between built-ins (hermite / spring / snap)
   *  via the top-bar toggle. */
  yEngine: TransitionFactory<YRange>;
  /** Short label for the currently selected transition — used in panel keys
   *  so toggling re-mounts the charts (the factory is captured at
   *  ChartContainer mount, so a live swap needs a fresh ChartInstance). */
  yEngineLabel: string;
}

export interface StressPanel {
  id: string;
  title: string;
  /** One-line hint shown under the title. */
  hint: string;
  /** Optional inline note in the panel footer (bigger explanations). */
  note?: string;
  render: (ctx: PanelCtx) => ReactNode;
  /** Minimum vertical space. Defaults to 320px. */
  minHeight?: number;
}

function StressPanelItem({
  panel: p,
  theme,
  perfHud,
  yEngine,
  yEngineLabel,
}: {
  panel: StressPanel;
  theme: ChartTheme;
  perfHud: (() => PerfConfig) | undefined;
  yEngine: TransitionFactory<YRange>;
  yEngineLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mounted = useNearViewport(ref);
  const height = p.minHeight ?? 320;

  return (
    <div
      ref={ref}
      id={`stress-${p.id}`}
      style={{ display: 'grid', gap: 4, scrollMarginTop: 'var(--stress-scroll-offset, 80px)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <strong style={{ fontSize: 14, color: theme.tooltip.textColor }}>{p.title}</strong>
          <span style={{ fontSize: 12, color: theme.axis.textColor, opacity: 0.8 }}>{p.hint}</span>
        </div>
      </div>
      <div style={{ height, display: 'grid', minHeight: 0, position: 'relative' }}>
        {mounted ? (
          // `ChartContainer` captures `perf` and `animations.axis.y.curve` at mount
          // only, so toggling the global HUD or the Y transition re-keys the chart
          // to force a remount.
          <Cell key={`${p.id}:${perfHud ? 'perf' : 'no-perf'}:${yEngineLabel}`} theme={theme}>
            {p.render({ theme, perfHud, yEngine, yEngineLabel })}
          </Cell>
        ) : (
          <Cell theme={theme} />
        )}
      </div>
      {p.note && (
        <div style={{ fontSize: 11, color: theme.axis.textColor, opacity: 0.6, paddingLeft: 2 }}>{p.note}</div>
      )}
    </div>
  );
}

export function StressPanels({
  panels,
  theme,
  perfHud,
  yEngine,
  yEngineLabel,
}: {
  panels: readonly StressPanel[];
  theme: ChartTheme;
  perfHud: (() => PerfConfig) | undefined;
  yEngine: TransitionFactory<YRange>;
  yEngineLabel: string;
}) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {panels.map((p) => (
        <StressPanelItem
          key={p.id}
          panel={p}
          theme={theme}
          perfHud={perfHud}
          yEngine={yEngine}
          yEngineLabel={yEngineLabel}
        />
      ))}
    </div>
  );
}
