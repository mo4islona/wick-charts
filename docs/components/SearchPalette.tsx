import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { ChartTheme } from '@wick-charts/react';
import { Search } from 'lucide-react';
import { createPortal } from 'react-dom';

import manifest from '../data/api-manifest.json';
import { ROUTE_TO_COMPONENT } from '../pages/api';
import { INTEGRATION_STEPS } from '../pages/integrations';
import { GUIDE_STEPS } from '../pages/use-cases';
import { routeToPath } from '../router';
import { type Route, getSections, isRoute } from '../routes';
import { type ManifestProp, type SearchEntry, buildSearchIndex, searchDocs } from '../search';
import { metaForRoute } from '../seo';
import { hexToRgba, isDarkColor, saturate } from '../utils';

const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';
const RECENT_KEY = 'docs-search-recent';
const RECENT_LIMIT = 5;

interface PropDetail extends ManifestProp {
  type?: string;
  optional?: boolean;
  description?: string;
  nested?: { props: PropDetail[] } | null;
}

const COMPONENTS = manifest.components as unknown as Record<string, { props: PropDetail[] }>;

let cachedIndex: SearchEntry[] | null = null;

/** Built on first use, then shared by every palette. */
function docsIndex(): SearchEntry[] {
  if (cachedIndex) return cachedIndex;

  const props: Partial<Record<Route, { component: string; props: ManifestProp[] }>> = {};

  for (const [route, component] of Object.entries(ROUTE_TO_COMPONENT)) {
    const entry = COMPONENTS[component];
    if (entry && isRoute(route)) props[route] = { component, props: entry.props };
  }

  cachedIndex = buildSearchIndex({
    sections: getSections(),
    describe: (route) => metaForRoute(route).description,
    steps: { ...GUIDE_STEPS, ...INTEGRATION_STEPS },
    props,
  });

  return cachedIndex;
}

function hrefOf(entry: SearchEntry): string {
  const path = routeToPath(entry.route);

  return entry.hash ? `${path}#${entry.hash}` : path;
}

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
}

function shortcutLabel(): string {
  return isMac() ? '⌘K' : 'Ctrl K';
}

// Stroke icons on a 36×24 grid: a sketch of each chart type, then guides and props.
const CHART_ICONS: Partial<Record<Route, string>> = {
  'charts/candlestick': 'M7 4v16M4 8h6v8H4zM18 2v14M15 5h6v7h-6zM29 8v14M26 11h6v6h-6z',
  'charts/line': 'M2 18L8 12L13 15L19 7L25 10L34 4',
  'charts/band': 'M2 13L10 8L18 10L26 5L34 7M2 19L10 15L18 17L26 12L34 14',
  'charts/bar': 'M4 22V12h5v10zM12 22V6h5v16zM20 22V14h5v8zM28 22V9h5v13z',
  'charts/pie': 'M17 4a9 9 0 1 0 9 9h-9zM20 1a9 9 0 0 1 9 9h-9z',
  'charts/heatmap': 'M3 3h8v8H3zM14 3h8v8h-8zM25 3h8v8h-8zM3 14h8v8H3zM14 14h8v8h-8zM25 14h8v8h-8z',
  'charts/depth': 'M2 6h6v4h5v4h4v8M34 6h-6v5h-4v4h-5',
  'charts/sankey': 'M3 4h4c10 0 12 12 22 12h4M3 18h4c10 0 12-12 22-12h4',
  'charts/gauge': 'M10.2 19.5A9 9 0 1 1 25.8 19.5M18 15l5-6',
  'charts/sparkline': 'M2 16L6 14L10 17L14 10L18 12L22 6L26 9L30 5L34 7',
};
const PAGE_ICON = 'M10 3h12l5 5v13H10zM22 3v5h5M14 13h9M14 17h6';
const PROP_ICON = 'M13 6l-6 6 6 6M23 6l6 6-6 6';

function iconFor(entry: SearchEntry): string {
  if (entry.kind === 'prop') return PROP_ICON;

  return CHART_ICONS[entry.route] ?? PAGE_ICON;
}

function EntryIcon({ path, height }: { path: string; height: number }) {
  return (
    <svg
      width={height * 1.5}
      height={height}
      viewBox="0 0 36 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function entryId(entry: SearchEntry): string {
  return `${entry.kind}|${entry.route}|${entry.hash ?? ''}|${entry.label}`;
}

/** Entries the reader opened from search before, newest first; ids that left the index drop out. */
function readRecent(): SearchEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];

    const ids: unknown = JSON.parse(raw);
    if (!Array.isArray(ids)) return [];

    const byId = new Map(docsIndex().map((e) => [entryId(e), e]));

    return ids.flatMap((id) => {
      const found = typeof id === 'string' ? byId.get(id) : undefined;

      return found ? [found] : [];
    });
  } catch {
    return [];
  }
}

function rememberRecent(entry: SearchEntry): void {
  try {
    const id = entryId(entry);
    const rest = readRecent()
      .map(entryId)
      .filter((other) => other !== id);

    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...rest].slice(0, RECENT_LIMIT)));
  } catch {
    // Storage blocked: the palette just shows no recent entries.
  }
}

interface ResultSection {
  title: string;
  entries: SearchEntry[];
  /** On a phone, a browse section renders as a grid of tiles. */
  tiles?: boolean;
}

function sectionsFor(query: string, recent: SearchEntry[]): ResultSection[] {
  if (query.trim() !== '') return searchDocs(docsIndex(), query);

  const charts = docsIndex().filter((e) => e.kind === 'page' && e.route in CHART_ICONS);
  const sections: ResultSection[] = [];
  if (recent.length > 0) sections.push({ title: 'Recent', entries: recent });
  sections.push({ title: 'Charts', entries: charts, tiles: true });

  return sections;
}

function propDetail(entry: SearchEntry): PropDetail | null {
  const component = ROUTE_TO_COMPONENT[entry.route];
  const path = entry.hash?.replace(/^prop-/, '');
  if (!component || !path) return null;

  let props = COMPONENTS[component]?.props ?? [];
  let found: PropDetail | null = null;

  for (const name of path.split('.')) {
    found = props.find((p) => p.name === name) ?? null;
    if (!found) return null;

    props = found.nested?.props ?? [];
  }

  return found;
}

function firstParagraph(text: string): string {
  const [first = ''] = text.split(/\n\s*\n/);

  return first.replace(/`/g, '').replace(/\s+/g, ' ').trim();
}

interface Preview {
  crumb: string;
  description: string;
  signature?: string;
}

function previewOf(entry: SearchEntry): Preview {
  if (entry.kind === 'prop') {
    const prop = propDetail(entry);
    const optional = prop?.optional ? '?' : '';

    return {
      crumb: entry.hint,
      signature: prop?.type ? `${entry.label}${optional}: ${prop.type}` : undefined,
      description: prop?.description ? firstParagraph(prop.description) : '',
    };
  }

  // A step's hint is its guide's name; the guide's description is the best summary there is.
  const crumb = entry.kind === 'step' ? entry.hint : [entry.hint, entry.label].filter(Boolean).join(' › ');

  return { crumb, description: metaForRoute(entry.route).description };
}

function Highlight({ text, query, color }: { text: string; query: string; color: string }) {
  const [token = ''] = query.trim().toLowerCase().split(/\s+/);
  const at = token ? text.toLowerCase().indexOf(token) : -1;
  if (at < 0) return <>{text}</>;

  return (
    <>
      {text.slice(0, at)}
      <mark style={{ background: 'transparent', color, fontWeight: 600 }}>{text.slice(at, at + token.length)}</mark>
      {text.slice(at + token.length)}
    </>
  );
}

/**
 * Groups keep their fixed order (pages, steps, props), so the first row is not always the best match:
 * "fade" lists a guide that mentions fades above the `fade` prop. Start on an exact name, then a prefix.
 */
function bestHit(hits: SearchEntry[], query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  const exact = hits.findIndex((e) => e.key === q);
  if (exact >= 0) return exact;

  return Math.max(
    0,
    hits.findIndex((e) => e.key.startsWith(q)),
  );
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

const PALETTE_STYLES = `
.sp-scrim{position:absolute;inset:0;margin:0;padding:0;border:0;cursor:default;-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);animation:sp-fade .2s ease-out both}
.sp-content{animation:sp-fade .2s .12s ease-out both}
.sp-row{animation:sp-rise .3s cubic-bezier(.2,.8,.2,1) both}
@keyframes sp-fade{from{opacity:0}to{opacity:1}}
@keyframes sp-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.sp-scrim,.sp-content,.sp-row{animation:none}}
`;

export interface SearchPaletteProps {
  theme: ChartTheme;
  mobile: boolean;
  /** The trigger the reader used; the palette grows out of it. */
  origin: DOMRect | null;
  onClose: () => void;
  /** Opens a result; `hash` is an element id on the target page. */
  onNavigate: (route: Route, hash?: string) => void;
}

/** Docs search: a centred palette on desktop, a full-screen sheet on a phone. Mount it only while open. */
export function SearchPalette({ theme, mobile, origin, onClose, onNavigate }: SearchPaletteProps) {
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recent] = useState(readRecent);

  const sections = useMemo(() => sectionsFor(query, recent), [query, recent]);
  const hits = useMemo(() => sections.flatMap((section) => section.entries), [sections]);
  const selected: SearchEntry | undefined = hits[Math.min(active, hits.length - 1)];

  useEffect(() => {
    setActive(bestHit(hits, query));
  }, [hits, query]);

  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, listId]);

  // Focus goes back to whatever had it, usually the trigger.
  useEffect(() => {
    const before = document.activeElement;
    input.current?.focus();

    return () => {
      if (before instanceof HTMLElement) before.focus();
    };
  }, []);

  useLayoutEffect(() => {
    const el = panel.current;
    if (!el || prefersReducedMotion()) return;

    const box = el.getBoundingClientRect();

    if (mobile) {
      const x = origin ? origin.left + origin.width / 2 : box.width / 2;
      const y = origin ? origin.top + origin.height / 2 : 0;
      el.animate([{ clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(150vmax at ${x}px ${y}px)` }], {
        duration: 450,
        easing: 'cubic-bezier(.3,.8,.2,1)',
      });

      return;
    }

    const from = origin
      ? `translate(${origin.left - box.left}px, ${origin.top - box.top}px) scale(${origin.width / box.width}, ${origin.height / box.height})`
      : 'translateY(-8px) scale(0.97)';
    el.animate(
      [
        { transform: from, opacity: 0.3 },
        { transform: 'none', opacity: 1 },
      ],
      {
        duration: 380,
        easing: 'cubic-bezier(.2,.9,.2,1)',
      },
    );
  }, [mobile, origin]);

  const select = (entry: SearchEntry) => {
    rememberRecent(entry);
    onClose();
    onNavigate(entry.route, entry.hash);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => Math.min(hits.length - 1, Math.max(0, i + step)));

      return;
    }

    if (e.key === 'Enter') {
      if (!selected) return;

      e.preventDefault();

      const newTab = e.metaKey || e.ctrlKey;
      if (newTab) {
        window.open(hrefOf(selected), '_blank', 'noopener');

        return;
      }

      select(selected);

      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const onHitClick = (e: MouseEvent<HTMLAnchorElement>, entry: SearchEntry) => {
    const modified = e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
    if (modified) return;

    e.preventDefault();
    select(entry);
  };

  const dark = isDarkColor(theme.background);
  const muted = theme.axis.textColor;
  const border = theme.tooltip.borderColor;
  const accent = theme.line.color;
  const fontSize = mobile ? theme.typography.fontSize + 1 : theme.typography.fontSize;
  const surface = `color-mix(in srgb, ${theme.tooltip.textColor} 4%, transparent)`;
  const kbd = { border, background: surface, color: muted };

  const panelStyle: CSSProperties = mobile
    ? { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: theme.background }
    : {
        position: 'absolute',
        top: 'max(56px, 12vh)',
        left: 0,
        right: 0,
        margin: '0 auto',
        width: 'min(720px, calc(100vw - 32px))',
        height: 'min(520px, calc(100vh - max(56px, 12vh) - 32px))',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: 14,
        border: `1px solid ${border}`,
        background: theme.background,
        boxShadow: dark ? '0 30px 90px -20px rgba(0,0,0,0.6)' : '0 30px 80px -24px rgba(0,0,0,0.25)',
        transformOrigin: '0 0',
      };

  let index = 0;
  const list = sections.map((section) => {
    const asTiles = mobile && section.tiles === true && query.trim() === '';
    const rows = section.entries.map((entry) => {
      const i = index;
      index += 1;

      return (
        <ResultRow
          key={entryId(entry)}
          entry={entry}
          view={{
            id: `${listId}-${i}`,
            selected: i === active && !mobile,
            tile: asTiles,
            delay: Math.min(i, 12) * 18,
            query,
          }}
          style={{ theme, mobile, accent, muted, border, surface, fontSize }}
          on={{ click: (e) => onHitClick(e, entry), hover: () => setActive(i) }}
        />
      );
    });

    return (
      <div key={section.title}>
        <div
          style={{
            padding: mobile ? '16px 4px 8px' : '12px 10px 6px',
            fontSize: fontSize - 2,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: muted,
          }}
        >
          {section.title}
        </div>
        {asTiles ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>{rows}</div>
        ) : (
          rows
        )}
      </div>
    );
  });

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 400,
        color: theme.tooltip.textColor,
        fontFamily: theme.typography.fontFamily,
        fontSize,
      }}
    >
      <style>{PALETTE_STYLES}</style>
      {!mobile && (
        <button
          type="button"
          className="sp-scrim"
          aria-label="Close search"
          onClick={onClose}
          style={{ background: dark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.18)' }}
        />
      )}

      <div ref={panel} role="dialog" aria-modal="true" aria-label="Search docs" style={panelStyle}>
        <div className="sp-content" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: mobile ? 10 : 12,
              height: mobile ? 64 : 56,
              padding: mobile ? '0 12px' : '0 16px',
              flexShrink: 0,
              borderBottom: `1px solid ${border}`,
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flex: 1,
                minWidth: 0,
                height: mobile ? 44 : '100%',
                padding: mobile ? '0 12px' : 0,
                borderRadius: mobile ? 12 : 0,
                border: mobile ? `1px solid ${border}` : 'none',
                background: mobile ? surface : 'transparent',
                color: muted,
              }}
            >
              <Search size={mobile ? 17 : 18} aria-hidden />
              <input
                ref={input}
                type="text"
                enterKeyHint="search"
                value={query}
                placeholder={mobile ? 'Search docs' : 'Search pages, guide steps and props'}
                aria-label="Search docs"
                role="combobox"
                aria-expanded={hits.length > 0}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={
                  !mobile && selected ? `${listId}-${Math.min(active, hits.length - 1)}` : undefined
                }
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: '100%',
                  padding: 0,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: theme.tooltip.textColor,
                  // 16px keeps iOS Safari from zooming the page when the field takes focus.
                  fontSize: 16,
                  fontFamily: 'inherit',
                }}
              />
            </label>
            {mobile ? (
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '8px 2px',
                  border: 'none',
                  background: 'transparent',
                  color: accent,
                  fontSize: 15,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            ) : (
              <Kbd colors={kbd}>esc</Kbd>
            )}
          </div>

          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            <div
              id={listId}
              role="listbox"
              aria-label="Search results"
              onMouseDown={(e) => e.preventDefault()}
              style={{
                flex: 1,
                minWidth: 0,
                overflowY: 'auto',
                padding: mobile ? '0 12px 24px' : '4px 8px 10px',
              }}
            >
              {list}
              {hits.length === 0 && (
                <div style={{ padding: '40px 16px', textAlign: 'center', color: muted }}>No results for “{query}”</div>
              )}
            </div>

            {!mobile && selected && (
              <PreviewPane entry={selected} style={{ theme, accent, muted, border, surface, fontSize }} />
            )}
          </div>

          {!mobile && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                height: 40,
                padding: '0 16px',
                flexShrink: 0,
                borderTop: `1px solid ${border}`,
                fontSize: fontSize - 1,
                color: muted,
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Kbd colors={kbd}>↑</Kbd>
                <Kbd colors={kbd}>↓</Kbd>
                <span style={{ marginLeft: 2 }}>navigate</span>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Kbd colors={kbd}>↵</Kbd>
                open
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Kbd colors={kbd}>{isMac() ? '⌘↵' : 'Ctrl ↵'}</Kbd>
                new tab
              </span>
              <span style={{ flex: 1 }} />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Kbd colors={kbd}>esc</Kbd>
                close
              </span>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface RowStyle {
  theme: ChartTheme;
  mobile: boolean;
  accent: string;
  muted: string;
  border: string;
  surface: string;
  fontSize: number;
}

function ResultRow({
  entry,
  view,
  style,
  on,
}: {
  entry: SearchEntry;
  view: { id: string; selected: boolean; tile: boolean; delay: number; query: string };
  style: RowStyle;
  on: { click: (e: MouseEvent<HTMLAnchorElement>) => void; hover: () => void };
}) {
  const { mobile, accent, muted, border, surface, fontSize } = style;
  const selectedBg = hexToRgba(saturate(accent, 0.55), 0.16);
  const isProp = entry.kind === 'prop';

  if (view.tile) {
    return (
      <a
        id={view.id}
        href={hrefOf(entry)}
        className="sp-row"
        onClick={on.click}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          height: 84,
          borderRadius: 12,
          border: `1px solid ${border}`,
          background: surface,
          color: 'inherit',
          textDecoration: 'none',
          fontSize: fontSize - 0.5,
          animationDelay: `${view.delay}ms`,
        }}
      >
        <span style={{ display: 'flex', color: accent }}>
          <EntryIcon path={iconFor(entry)} height={24} />
        </span>
        {entry.label}
      </a>
    );
  }

  return (
    <a
      id={view.id}
      role="option"
      aria-selected={view.selected}
      href={hrefOf(entry)}
      className="sp-row"
      onClick={on.click}
      onMouseMove={view.selected ? undefined : on.hover}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: mobile ? 52 : undefined,
        padding: mobile ? '6px 4px' : '7px 10px',
        borderRadius: mobile ? 0 : 9,
        borderBottom: mobile ? `1px solid ${border}` : 'none',
        background: view.selected ? selectedBg : 'transparent',
        color: 'inherit',
        textDecoration: 'none',
        animationDelay: `${view.delay}ms`,
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 38,
          height: 28,
          flexShrink: 0,
          borderRadius: 7,
          border: `1px solid ${border}`,
          background: surface,
          color: view.selected ? accent : muted,
        }}
      >
        <EntryIcon path={iconFor(entry)} height={18} />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: isProp ? fontSize : fontSize + 1,
            fontWeight: 500,
            fontFamily: isProp ? MONO : 'inherit',
          }}
        >
          <Highlight text={entry.label} query={view.query} color={accent} />
        </span>
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: fontSize - 1,
            color: muted,
          }}
        >
          {entry.hint}
        </span>
      </span>
      {view.selected && <span style={{ color: muted }}>↵</span>}
    </a>
  );
}

function PreviewPane({ entry, style }: { entry: SearchEntry; style: Omit<RowStyle, 'mobile'> }) {
  const { accent, muted, border, surface, fontSize, theme } = style;
  const preview = previewOf(entry);
  const isProp = entry.kind === 'prop';
  const grid = `color-mix(in srgb, ${theme.tooltip.textColor} 6%, transparent)`;

  return (
    <div
      style={{
        width: 260,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 16,
        boxSizing: 'border-box',
        overflowY: 'auto',
        borderLeft: `1px solid ${border}`,
        background: surface,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 120,
          flexShrink: 0,
          borderRadius: 10,
          border: `1px solid ${border}`,
          backgroundImage: `linear-gradient(${grid} 1px, transparent 1px), linear-gradient(90deg, ${grid} 1px, transparent 1px)`,
          backgroundSize: '16px 16px',
          color: accent,
        }}
      >
        <EntryIcon path={iconFor(entry)} height={isProp ? 48 : 72} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span
          style={{
            fontSize: fontSize + 3,
            fontWeight: 600,
            fontFamily: isProp ? MONO : 'inherit',
            wordBreak: 'break-word',
          }}
        >
          {entry.label}
        </span>
        <span style={{ fontSize: fontSize - 1, color: muted }}>{preview.crumb}</span>
      </div>
      {preview.signature && (
        <code
          style={{
            padding: '8px 10px',
            borderRadius: 8,
            background: `color-mix(in srgb, ${theme.tooltip.textColor} 7%, transparent)`,
            fontFamily: MONO,
            fontSize: fontSize - 1,
            lineHeight: 1.5,
            wordBreak: 'break-word',
          }}
        >
          {preview.signature}
        </code>
      )}
      {preview.description && (
        <p
          style={{
            margin: 0,
            fontSize,
            lineHeight: 1.55,
            opacity: 0.85,
            display: '-webkit-box',
            WebkitLineClamp: 7,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {preview.description}
        </p>
      )}
    </div>
  );
}

function Kbd({
  colors,
  children,
}: {
  colors: { border: string; background: string; color: string };
  children: ReactNode;
}) {
  return (
    <kbd
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 18,
        height: 18,
        padding: '0 5px',
        boxSizing: 'border-box',
        borderRadius: 5,
        border: `1px solid ${colors.border}`,
        background: colors.background,
        color: colors.color,
        fontFamily: MONO,
        fontSize: 10,
      }}
    >
      {children}
    </kbd>
  );
}

/** The sidebar's search field: a button that opens the palette, with the shortcut beside it. */
export function SearchTrigger({
  theme,
  mobile,
  onOpen,
}: {
  theme: ChartTheme;
  mobile: boolean;
  onOpen: (origin: DOMRect) => void;
}) {
  const [hover, setHover] = useState(false);
  const border = theme.tooltip.borderColor;
  const muted = theme.axis.textColor;

  return (
    <div style={{ position: 'relative', padding: mobile ? '10px 14px 2px' : '10px 10px 2px' }}>
      <button
        type="button"
        data-search-trigger=""
        onClick={(e) => onOpen(e.currentTarget.getBoundingClientRect())}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          height: mobile ? 38 : 32,
          padding: '0 8px 0 10px',
          border: `1px solid ${hover ? hexToRgba(theme.line.color, 0.6) : border}`,
          borderRadius: 8,
          background: 'transparent',
          color: muted,
          fontSize: mobile ? theme.typography.fontSize + 1 : theme.typography.fontSize,
          fontFamily: 'inherit',
          textAlign: 'left',
          cursor: 'pointer',
          transition: 'border-color 0.15s',
        }}
      >
        <Search size={14} aria-hidden />
        <span style={{ flex: 1 }}>Search docs</span>
        {!mobile && (
          <kbd
            style={{
              padding: '1px 5px',
              border: `1px solid ${border}`,
              borderRadius: 4,
              fontSize: theme.typography.fontSize - 3,
              fontFamily: 'inherit',
              color: muted,
              whiteSpace: 'nowrap',
            }}
          >
            {shortcutLabel()}
          </kbd>
        )}
      </button>
    </div>
  );
}
