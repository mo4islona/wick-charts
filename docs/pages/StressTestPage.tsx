import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { type ChartTheme, hermite, perfHud as perfHudConfig, snap, spring } from '@wick-charts/react';

import { Toggle } from '../components/playground/primitives';
import { themeSurfaceVars } from '../components/playground/themeSurface';
import { dataPanels } from './stress/data';
import { heatmapPanels } from './stress/heatmap';
import { multiPanels } from './stress/multi';
import { type StressPanel, StressPanels } from './stress/panel';
import { piePanels } from './stress/pie';
import { reactPanels } from './stress/react';
import { scalePanels } from './stress/scale';
import { animationPanels, streamingPanels } from './stress/streaming';
import { themePanels } from './stress/theme';
import { timeAxisPanels } from './stress/timeaxis';
import { viewportPanels } from './stress/viewport';
import { volumePanels } from './stress/volume';

type GroupId =
  | 'volume'
  | 'streaming'
  | 'animation'
  | 'data'
  | 'scale'
  | 'timeaxis'
  | 'multi'
  | 'pie'
  | 'heatmap'
  | 'viewport'
  | 'theme'
  | 'react';

interface StressGroup {
  id: GroupId;
  label: string;
  hint: string;
  panels: readonly StressPanel[];
}

interface StressCategory {
  id: string;
  label: string;
  groups: StressGroup[];
}

/**
 * Groups organized by what they stress — throughput, hostile input,
 * per-renderer edge cases, and the host environment. The tree nav renders
 * one cluster per category so the twelve groups read as four questions
 * instead of a flat pile of tabs.
 */
const CATEGORIES: StressCategory[] = [
  {
    id: 'performance',
    label: 'Performance',
    groups: [
      { id: 'volume', label: 'Volume', hint: '10k · 100k points · streaming under load', panels: volumePanels },
      {
        id: 'streaming',
        label: 'Streaming',
        hint: 'warm-up · jumps · jitter · burst / pause',
        panels: streamingPanels,
      },
      {
        id: 'animation',
        label: 'Animation',
        hint: 'cadence · gesture priority · background tab',
        panels: animationPanels,
      },
    ],
  },
  {
    id: 'robustness',
    label: 'Hostile data',
    groups: [
      { id: 'data', label: 'Hygiene', hint: 'empty · nulls · NaN · duplicates · gaps', panels: dataPanels },
      { id: 'scale', label: 'Scale', hint: 'constant · near-zero · giant · negative', panels: scalePanels },
      { id: 'timeaxis', label: 'Time axis', hint: 'milliseconds → decades → centuries', panels: timeAxisPanels },
    ],
  },
  {
    id: 'renderers',
    label: 'Renderers',
    groups: [
      { id: 'multi', label: 'Multi-series', hint: 'candle + line + bar overlays, shared scales', panels: multiPanels },
      { id: 'pie', label: 'Pie', hint: 'zero-total · 100 slices · poisoned values', panels: piePanels },
      { id: 'heatmap', label: 'Heatmap', hint: 'NaN cells · sparse · shape churn · 1.2k cells', panels: heatmapPanels },
    ],
  },
  {
    id: 'environment',
    label: 'Environment',
    groups: [
      {
        id: 'viewport',
        label: 'Viewport',
        hint: 'tiny · ultra-wide · zoom cycle · display:none',
        panels: viewportPanels,
      },
      { id: 'theme', label: 'Theme', hint: 'thin candles · rapid cycle · low contrast', panels: themePanels },
      { id: 'react', label: 'React', hint: 'ref identity · series id churn', panels: reactPanels },
    ],
  },
];

const GROUPS: StressGroup[] = CATEGORIES.flatMap((category) => category.groups);
const TOTAL_PANELS = GROUPS.reduce((sum, group) => sum + group.panels.length, 0);
const FIRST_PANEL_ID = GROUPS[0].panels[0].id;

const GROUP_BY_PANEL_ID = new Map<string, StressGroup>();
// A group's heading (now a full-size section header) can be taller than the
// gap between it and the previous group's last panel — so the scrollspy
// also tracks each group's own landmark, not just panels, and resolves it
// to the group's first panel. Without this, scrolling past a group boundary
// has a "dead zone" where neither the outgoing nor incoming panel is under
// the trigger line, and the highlight sticks on the stale outgoing panel.
const FIRST_PANEL_ID_BY_GROUP_LANDMARK = new Map<string, string>();

for (const category of CATEGORIES) {
  for (const group of category.groups) {
    FIRST_PANEL_ID_BY_GROUP_LANDMARK.set(`group-${group.id}`, group.panels[0].id);
    for (const panel of group.panels) GROUP_BY_PANEL_ID.set(panel.id, group);
  }
}

const ACTIVE_PANEL_STORAGE_KEY = 'wick-charts:stress-test:panel';
const CATEGORY_STORAGE_KEY = 'wick-charts:stress-test:category';

function readPersistedPanelId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_PANEL_STORAGE_KEY);
  } catch {
    // localStorage may be unavailable (private mode, sandboxed iframe).
    return null;
  }
}

function readPersistedCategoryId(): string {
  try {
    const stored = window.localStorage.getItem(CATEGORY_STORAGE_KEY);
    if (CATEGORIES.some((c) => c.id === stored)) return stored as string;
  } catch {
    // localStorage may be unavailable (private mode, sandboxed iframe).
  }

  return CATEGORIES[0].id;
}

type YEngineLabel = 'hermite' | 'spring' | 'snap';

const Y_ENGINE_FACTORIES = {
  hermite,
  spring,
  snap,
} as const;

export function StressTestPage({ theme }: { theme: ChartTheme }) {
  const [perfHud, setPerfHud] = useState(false);
  const [yEngineLabel, setYEngineLabel] = useState<YEngineLabel>('hermite');
  const yEngine = useMemo(() => Y_ENGINE_FACTORIES[yEngineLabel](), [yEngineLabel]);
  const [activePanelId, setActivePanelId] = useState<string>(() => readPersistedPanelId() ?? FIRST_PANEL_ID);
  const [categoryId, setCategoryId] = useState<string>(readPersistedCategoryId);
  const [headerHeight, setHeaderHeight] = useState(72);

  const surface = useMemo(() => themeSurfaceVars(theme), [theme]);
  const accent = theme.seriesColors[0] ?? theme.line.color;
  const mono = 'var(--mono, ui-monospace, monospace)';

  const containerRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const treeRef = useRef<HTMLElement | null>(null);
  // While a click-initiated smooth scroll is in flight, the scrollspy would
  // otherwise walk `activePanelId` through every panel it passes on the way
  // — and the tree's "keep active item visible" effect follows along,
  // jumping the rail around before settling on the real target. A click
  // already tells us exactly where we're going, so suppress scrollspy for
  // the duration of that one scroll.
  const suppressScrollspyRef = useRef(false);

  // The tree and every panel measure their scroll offset against the sticky
  // header's live height (theme/font changes can reflow it), via the
  // `--stress-scroll-offset` var set on the scroll container below.
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    // `entry.contentRect` excludes padding and border — the header has both,
    // so it under-reports the header's real rendered height. Everything downstream
    // (the nav rail's sticky `top`/`maxHeight`, the scroll-margin var) needs the
    // full border-box height instead, or it sticks partway under the header.
    const observer = new ResizeObserver(() => setHeaderHeight(header.getBoundingClientRect().height));
    observer.observe(header);

    return () => observer.disconnect();
  }, []);

  // Jump straight to the last-viewed scenario on load — instant, no smooth
  // scroll, so the page doesn't animate itself on every refresh.
  useLayoutEffect(() => {
    const id = readPersistedPanelId();
    if (!id) return;

    document.getElementById(`stress-${id}`)?.scrollIntoView({ block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scrollspy: whichever panel or group landmark last crossed the line just
  // under the sticky header is "active". Tracking group landmarks too (not
  // just panels) closes the dead zone between one group's last panel and
  // the next group's header, where neither panel is near the trigger line.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // DOM order here matches top-to-bottom layout order, so the last
    // landmark whose top has crossed the line is simply the last one
    // reached while walking the array in order.
    const landmarks = Array.from(container.querySelectorAll<HTMLElement>('[id^="stress-"], [id^="group-"]'));

    const recompute = (): void => {
      if (suppressScrollspyRef.current) return;

      // A generous margin below the header, not a tight one: `scrollToId`
      // lands a target only ~8px under the header for a clean visual gap,
      // so a tight band here left the two computations fighting over a
      // few px of rounding — a jump would land, then the very next
      // recompute would flip back to the landmark just before it.
      //
      // `el.getBoundingClientRect().top` is viewport-absolute, but this page
      // isn't always flush against the viewport's top edge — the docs site
      // wraps it in its own chrome above `container`. Without adding
      // `container`'s own top, the trigger line sits too high by exactly
      // that offset, so a panel near the end of the scrollable area (which
      // can't be pulled up any further to cross a too-high line) never
      // registers as "current" — the spy falls back to an earlier landmark
      // and overwrites whatever panel was just selected or restored.
      const bandTop = container.getBoundingClientRect().top + headerHeight + 40;
      let current = landmarks[0];
      for (const el of landmarks) {
        if (el.getBoundingClientRect().top > bandTop) break;
        current = el;
      }

      const panelId = current.id.startsWith('group-')
        ? (FIRST_PANEL_ID_BY_GROUP_LANDMARK.get(current.id) ?? FIRST_PANEL_ID)
        : current.id.replace(/^stress-/, '');
      setActivePanelId(panelId);
    };

    const observer = new IntersectionObserver(recompute, {
      root: container,
      rootMargin: `-${headerHeight + 8}px 0px -70% 0px`,
      threshold: 0,
    });

    for (const el of landmarks) observer.observe(el);

    return () => observer.disconnect();
  }, [headerHeight]);

  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVE_PANEL_STORAGE_KEY, activePanelId);
    } catch {
      // localStorage write failed — non-critical; in-memory state still works.
    }
  }, [activePanelId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CATEGORY_STORAGE_KEY, categoryId);
    } catch {
      // localStorage write failed — non-critical; in-memory state still works.
    }
  }, [categoryId]);

  // Keep the highlighted tree entry inside the rail's own scroll area. Done
  // by hand (not `scrollIntoView`) because the rail sits inside a
  // `position: sticky` ancestor — Chrome's `scrollIntoView` walks the whole
  // scrollable-ancestor chain and can end up scrolling the *page* along with
  // the rail, undoing whatever scroll position drove this update.
  useEffect(() => {
    const nav = treeRef.current;
    const target = nav?.querySelector<HTMLElement>(`[data-panel="${activePanelId}"]`);
    if (!nav || !target) return;

    const navRect = nav.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    if (targetRect.top < navRect.top) {
      nav.scrollTop += targetRect.top - navRect.top;
    } else if (targetRect.bottom > navRect.bottom) {
      nav.scrollTop += targetRect.bottom - navRect.bottom;
    }
  }, [activePanelId]);

  function scrollToId(id: string, resultingPanelId: string): void {
    const header = headerRef.current;
    const container = containerRef.current;
    const target = document.getElementById(id);
    if (!header || !container || !target) return;

    const top =
      target.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop -
      header.offsetHeight -
      8;

    suppressScrollspyRef.current = true;
    setActivePanelId(resultingPanelId);

    const resumeScrollspy = () => {
      suppressScrollspyRef.current = false;
      container.removeEventListener('scrollend', resumeScrollspy);
    };
    container.addEventListener('scrollend', resumeScrollspy);
    // `scrollend` isn't supported everywhere (older Safari) — a timeout
    // comfortably longer than the smooth-scroll duration is the fallback.
    setTimeout(resumeScrollspy, 1000);

    container.scrollTo({ top, behavior: 'smooth' });
  }

  const visibleCategory = CATEGORIES.find((c) => c.id === categoryId) ?? CATEGORIES[0];
  const activeGroup = GROUP_BY_PANEL_ID.get(activePanelId) ?? visibleCategory.groups[0];

  return (
    <div
      ref={containerRef}
      className="wick-playground"
      style={{
        ...surface,
        display: 'grid',
        // `auto auto`, not `auto 1fr` — a `1fr` row is capped to the
        // viewport's remaining height, which becomes the tree nav's `sticky`
        // containing block. With 71 panels' worth of overflow, that caps the
        // nav to sticking only within the first screenful and then stranding
        // it as the page scrolls on. `auto` lets the row (and the nav's
        // containing block) grow with the actual content height, so it
        // sticks for the whole scroll range; `.wick-playground`'s own fixed
        // height + `overflowY: auto` still do the actual clipping/scrolling.
        gridTemplateRows: 'auto auto',
        overflowY: 'auto',
        minHeight: 0,
        ...({ '--stress-scroll-offset': `${headerHeight + 8}px` } as CSSProperties),
      }}
    >
      <header
        ref={headerRef}
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: theme.background,
          borderBottom: `1px solid ${theme.tooltip.borderColor}`,
          padding: '16px 16px 12px',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 16, color: theme.tooltip.textColor }}>Stress Tests</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: theme.axis.textColor, opacity: 0.8 }}>
            Visual regression catalog — {TOTAL_PANELS} scenarios in {GROUPS.length} groups.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: theme.tooltip.textColor }}>
            <span>Y engine</span>
            <div style={{ display: 'flex', border: `1px solid ${theme.tooltip.borderColor}`, borderRadius: 6 }}>
              {(['hermite', 'spring', 'snap'] as const).map((kind) => {
                const active = kind === yEngineLabel;

                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setYEngineLabel(kind)}
                    style={{
                      padding: '4px 10px',
                      fontSize: 12,
                      fontFamily: mono,
                      color: active ? theme.tooltip.textColor : theme.axis.textColor,
                      background: active ? theme.crosshair.labelBackground : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {kind}
                  </button>
                );
              })}
            </div>
          </div>

          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: theme.tooltip.textColor }}>
            Perf HUD <Toggle checked={perfHud} onChange={setPerfHud} />
          </span>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '272px 1fr', gap: 20, padding: 16 }}>
        <nav
          ref={treeRef}
          aria-label="Stress test scenarios"
          style={{
            position: 'sticky',
            top: headerHeight + 16,
            alignSelf: 'start',
            maxHeight: `calc(100vh - ${headerHeight + 32}px)`,
            overflowY: 'auto',
            // Without this, wheel input left over once the rail hits its own
            // scroll limit "chains" through to the page underneath — scrolling
            // the rail to either end also drags the whole page along with it.
            overscrollBehavior: 'contain',
            display: 'grid',
            gap: 16,
            paddingRight: 6,
          }}
        >
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 1,
              background: theme.background,
              paddingBottom: 10,
              borderBottom: `1px solid ${theme.tooltip.borderColor}`,
            }}
          >
            <select
              value={visibleCategory.id}
              onChange={(e) => {
                const category = CATEGORIES.find((c) => c.id === e.target.value);
                const firstGroup = category?.groups[0];
                if (!category || !firstGroup) return;

                setCategoryId(category.id);
                setActivePanelId(firstGroup.panels[0].id);
                containerRef.current?.scrollTo({ top: 0 });
              }}
              style={{
                width: '100%',
                padding: '6px 8px',
                fontSize: 12.5,
                fontFamily: mono,
                color: theme.tooltip.textColor,
                background: theme.tooltip.background,
                border: `1px solid ${theme.tooltip.borderColor}`,
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              {CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gap: 1 }}>
            {visibleCategory.groups.map((g) => {
              const groupActive = g.id === activeGroup.id;

              return (
                <div key={g.id} style={{ display: 'grid', gap: 1 }}>
                  <button
                    type="button"
                    onClick={() => scrollToId(`group-${g.id}`, g.panels[0].id)}
                    title={g.hint}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      textAlign: 'left',
                      padding: '7px 8px',
                      fontSize: 13.5,
                      fontFamily: mono,
                      color: groupActive ? theme.tooltip.textColor : theme.axis.textColor,
                      background: groupActive ? `color-mix(in oklab, ${accent} 14%, transparent)` : 'transparent',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                    }}
                  >
                    <span>{g.label}</span>
                    <span style={{ opacity: 0.5, fontVariantNumeric: 'tabular-nums' }}>{g.panels.length}</span>
                  </button>

                  <div style={{ display: 'grid', paddingLeft: 20 }}>
                    {g.panels.map((p) => {
                      const panelActive = p.id === activePanelId;

                      return (
                        <button
                          key={p.id}
                          type="button"
                          data-panel={p.id}
                          onClick={() => scrollToId(`stress-${p.id}`, p.id)}
                          title={p.hint}
                          style={{
                            textAlign: 'left',
                            padding: '4px 10px',
                            fontSize: 12.5,
                            fontFamily: mono,
                            color: panelActive ? accent : theme.axis.textColor,
                            opacity: panelActive ? 1 : 0.75,
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          {p.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </nav>

        <div style={{ display: 'grid', gap: 20, minWidth: 0 }}>
          {visibleCategory.groups.map((g) => (
            <div
              key={g.id}
              id={`group-${g.id}`}
              style={{ display: 'grid', gap: 10, scrollMarginTop: 'var(--stress-scroll-offset, 80px)' }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 10,
                  borderBottom: `1px solid ${theme.tooltip.borderColor}`,
                  paddingBottom: 8,
                }}
              >
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 650, color: theme.tooltip.textColor }}>{g.label}</h3>
                <span style={{ fontSize: 13, color: theme.axis.textColor, opacity: 0.6 }}>{g.hint}</span>
              </div>

              <StressPanels
                panels={g.panels}
                theme={theme}
                perfHud={perfHud ? perfHudConfig : undefined}
                yEngine={yEngine}
                yEngineLabel={yEngineLabel}
              />
            </div>
          ))}

          {/* Without this, the last panel in a category can't scroll far
              enough to reach the "start" alignment scrollIntoView/scrollToId
              ask for — the container simply runs out of room below it. It
              then sits stranded mid-viewport, past the scrollspy's trigger
              band, so the spy immediately overrides the just-selected panel
              with whatever landmark IS above the band. */}
          <div aria-hidden="true" style={{ height: '100vh' }} />
        </div>
      </div>
    </div>
  );
}
