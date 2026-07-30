import {
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { ChartTheme } from '@wick-charts/react';

import { useIsMobile } from '../hooks/useIsMobile';
import { hexToRgba } from '../utils';
import { Segmented } from './kit';
import { HighlightedCode } from './playground/CodeView';
import { Splitter } from './Splitter';

export interface Step {
  heading: string;
  body: ReactNode;
  code?: string;
}

export interface AdvancedLayoutProps {
  theme: ChartTheme;
  /** Short paragraph above the columns explaining what the example demonstrates. */
  lead: ReactNode;
  /** The live demo. Wrapped in the unified bordered demo card (see {@link framedChart}). */
  chart: ReactNode;
  /** Walk-through entries — the article column (left on desktop, below the chart on mobile). */
  steps: Step[];
  /**
   * Full source text of the example (typically imported with Vite's `?raw`
   * query). Feeds the `Walkthrough / Source` switch in the article header.
   * Every use-case page should pass it — the switch is part of the shared
   * page anatomy.
   */
  source?: string;
  /**
   * Controls that swap the ARTICLE content (e.g. realtime-data's
   * Declarative/Imperative). Rendered in the article header row, beside the
   * Walkthrough/Source switch. Build them from the kit (`Segmented`).
   */
  docsControls?: ReactNode;
  /**
   * Controls that drive the LIVE DEMO (e.g. Replay, marker-shape pickers).
   * Rendered in a row above the demo card, sticky along with it on desktop.
   * Build them from the kit (`Segmented`, `ToggleChip`, `Button`).
   */
  chartControls?: ReactNode;
  /**
   * Definite height (px) of the demo card on mobile. Demos size themselves
   * with `height: 100%`, so the card must resolve to a real height — a
   * min-height leaves the ChartContainer at its 240px fallback. Default 380.
   */
  mobileChartHeight?: number;
  /**
   * When `false`, skip the bordered demo card around the chart slot. Use for
   * examples that frame each chart themselves (e.g. multi-chart-sync's three
   * pane cards) where the outer border just doubles up. Default `true`.
   */
  framedChart?: boolean;
}

type RailMode = 'walkthrough' | 'source';

const MIN_DOCS_WIDTH = 360;
/** Minimum chart width — the splitter clamps so the chart stays usable. */
const MIN_CHART_WIDTH = 360;
const STORAGE_KEY = 'use-cases-docs-width';

const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

/**
 * Height of the sticky chart column on desktop. Deliberately shorter than
 * the viewport — a hero-height chart reads as a wall next to the article;
 * ~half the screen keeps the demo present without dominating.
 */
const STICKY_CHART_HEIGHT = 'clamp(340px, 52vh, 540px)';

/** Walkthrough code blocks render a notch larger than the playground panel's
 * dense 11px default — article code is meant to be read, not skimmed. */
const DOCS_CODE_STYLE = { '--code-fs': '12px' } as CSSProperties;

function readStoredWidth(): number | null {
  // localStorage `getItem` can throw in privacy mode / sandboxed iframes /
  // blocked-storage contexts even when the global itself is defined. Swallow
  // and fall back to `null` (the even 50/50 default) — losing the persisted
  // width is a much better outcome than crashing the whole page render.
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The shared use-case page anatomy:
 *
 *   lead
 *   ┌ article column ───────────────┐ ┌ chart column (sticky) ┐
 *   │ [Walkthrough|Source] [docs…]  │ │ [chart controls…]     │
 *   │ steps / full source           │ │ ┌ demo card ────────┐ │
 *   │ …                             │ │ │ live chart        │ │
 *   └───────────────────────────────┘ │ └───────────────────┘ │
 *                                     └───────────────────────┘
 *
 * Article on the left (where reading starts), demo pinned on the right with
 * `position: sticky` so it stays in view while the page scrolls. A vertical
 * splitter resizes the columns; the choice is persisted. Stacks to one
 * column on mobile — controls + chart first, article below, page flow.
 */
export function AdvancedLayout({
  theme,
  lead,
  chart,
  steps,
  source,
  docsControls,
  chartControls,
  mobileChartHeight = 380,
  framedChart = true,
}: AdvancedLayoutProps) {
  const mobile = useIsMobile();
  const muted = hexToRgba(theme.tooltip.textColor, 0.7);
  const [mode, setMode] = useState<RailMode>('walkthrough');
  // `null` until the reader drags the splitter — that's the even 50/50 default
  // (docs and chart both `flex: 1`). A drag switches it to an explicit px width.
  const [docsWidth, setDocsWidth] = useState<number | null>(readStoredWidth);
  const containerRef = useRef<HTMLDivElement>(null);

  const showSource = source !== undefined && mode === 'source';

  useEffect(() => {
    // Nothing to persist until the reader drags (docsWidth === null is the
    // default 50/50 split). Same swallow as readStoredWidth — the persisted
    // width is a nicety, not load-bearing, so a write failure mustn't bubble up.
    if (typeof localStorage === 'undefined' || docsWidth === null) return;
    try {
      localStorage.setItem(STORAGE_KEY, String(Math.round(docsWidth)));
    } catch {
      // ignore
    }
  }, [docsWidth]);

  const onSplitterDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const containerLeft = container.getBoundingClientRect().left;
    const containerWidth = container.getBoundingClientRect().width;
    const maxDocs = Math.max(MIN_DOCS_WIDTH, containerWidth - MIN_CHART_WIDTH);

    // Pointer capture so a fast-moving drag doesn't lose events when the
    // cursor leaves the 1px-wide handle. Uses the same element that fired
    // pointerdown — required by the Pointer Events spec.
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      // Docs column width grows as the cursor moves right.
      const next = Math.min(maxDocs, Math.max(MIN_DOCS_WIDTH, ev.clientX - containerLeft));
      setDocsWidth(next);
    };

    const onUp = (ev: PointerEvent) => {
      handle.releasePointerCapture(ev.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.cursor = '';
    };

    document.body.style.cursor = 'col-resize';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // Default: an even 50/50 split — both columns ride `flex: 1`. Once the
  // reader drags the splitter the docs column pins to an explicit px width.
  // On mobile the panels stack, so the article is always full-width.
  const docsSizing: CSSProperties = mobile
    ? { width: '100%' }
    : docsWidth === null
      ? { flex: 1, minWidth: 0 }
      : { width: docsWidth, flexShrink: 0 };

  // The unified demo card: one border, one radius, on every use-case page.
  // Mobile needs a definite height (demos fill with `height: 100%`); desktop
  // fills the sticky wrapper.
  const cardSizing: CSSProperties = mobile ? { height: mobileChartHeight } : { flex: 1, minHeight: 0 };
  const chartInner = framedChart ? (
    <div
      style={{
        ...cardSizing,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        border: `1px solid ${theme.tooltip.borderColor}`,
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {chart}
    </div>
  ) : (
    <div
      style={{
        ...(mobile ? {} : cardSizing),
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {chart}
    </div>
  );

  // Desktop pins the chart with `position: sticky` inside its column, so it
  // tracks the reader through the article. On mobile the page just flows.
  const chartWrap: CSSProperties = mobile
    ? { display: 'flex', flexDirection: 'column' }
    : {
        position: 'sticky',
        top: 8,
        height: STICKY_CHART_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
      };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: mobile ? 8 : '8px 16px 48px',
        color: theme.tooltip.textColor,
      }}
    >
      <div
        style={{
          fontSize: theme.typography.fontSize + 1,
          color: muted,
          lineHeight: 1.6,
          maxWidth: 880,
        }}
      >
        {lead}
      </div>

      <div
        ref={containerRef}
        style={{
          display: 'flex',
          flexDirection: mobile ? 'column' : 'row',
          gap: mobile ? 20 : 0,
          alignItems: 'stretch',
        }}
      >
        {/* Article column — first in reading order on desktop, below the chart on mobile. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            minWidth: 0,
            order: mobile ? 2 : 1,
            paddingRight: mobile ? 0 : 8,
            ...docsSizing,
          }}
        >
          {(source !== undefined || docsControls) && (
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              {source !== undefined && (
                <Segmented<RailMode>
                  theme={theme}
                  value={mode}
                  onChange={setMode}
                  ariaLabel="Walkthrough or full source"
                  options={[
                    { value: 'walkthrough', label: 'Walkthrough' },
                    { value: 'source', label: 'Source' },
                  ]}
                />
              )}
              {docsControls}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, maxWidth: 680 }}>
            {showSource ? (
              <HighlightedCode code={source ?? ''} theme={theme} label="Full source" style={DOCS_CODE_STYLE} />
            ) : (
              steps.map((step, i) => (
                <StepBlock key={`${i}-${step.heading}`} step={step} theme={theme} muted={muted} first={i === 0} />
              ))
            )}
          </div>
        </div>

        {/* Column divider — sticky alongside the chart so the drag handle stays in view. */}
        {!mobile && (
          <div style={{ order: 2, alignSelf: 'stretch' }}>
            <div style={{ position: 'sticky', top: 8, height: STICKY_CHART_HEIGHT, display: 'flex' }}>
              <Splitter theme={theme} onPointerDown={onSplitterDown} ariaLabel="Resize walkthrough column" />
            </div>
          </div>
        )}

        {/* Chart column — sticky so the demo stays in view while reading. */}
        <div style={{ flex: 1, minWidth: 0, order: mobile ? 1 : 3 }}>
          <div style={chartWrap}>
            {chartControls && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 10,
                  fontSize: theme.typography.fontSize - 1,
                  color: muted,
                }}
              >
                {chartControls}
              </div>
            )}
            {chartInner}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepBlock({ step, theme, muted, first }: { step: Step; theme: ChartTheme; muted: string; first: boolean }) {
  const hairline = hexToRgba(theme.tooltip.textColor, 0.1);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        paddingTop: first ? 0 : 24,
        marginTop: first ? 0 : 24,
        borderTop: first ? undefined : `1px solid ${hairline}`,
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: theme.typography.fontSize - 1,
          color: muted,
          letterSpacing: '0.05em',
        }}
      >
        {step.heading}
      </div>
      <div
        style={{
          fontSize: theme.typography.fontSize + 1,
          lineHeight: 1.65,
          color: theme.tooltip.textColor,
        }}
      >
        {step.body}
      </div>
      {step.code && <HighlightedCode code={step.code} theme={theme} style={{ ...DOCS_CODE_STYLE, marginTop: 4 }} />}
    </div>
  );
}
