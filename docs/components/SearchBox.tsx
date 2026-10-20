import {
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { ChartTheme } from '@wick-charts/react';
import { Search, X } from 'lucide-react';
import { createPortal } from 'react-dom';

import manifest from '../data/api-manifest.json';
import { ROUTE_TO_COMPONENT } from '../pages/api';
import { GUIDE_STEPS } from '../pages/use-cases';
import { routeToPath } from '../router';
import { type Route, getSections, isRoute } from '../routes';
import { type ManifestProp, type SearchEntry, buildSearchIndex, searchDocs } from '../search';
import { metaForRoute } from '../seo';
import { hexToRgba, saturate } from '../utils';

const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';
const POPUP_WIDTH = 440;

let cachedIndex: SearchEntry[] | null = null;

/** Built on first use, then shared by every search box instance. */
function docsIndex(): SearchEntry[] {
  if (cachedIndex) return cachedIndex;

  const components = manifest.components as Record<string, { props: ManifestProp[] }>;
  const props: Partial<Record<Route, { component: string; props: ManifestProp[] }>> = {};

  for (const [route, component] of Object.entries(ROUTE_TO_COMPONENT)) {
    const entry = components[component];
    if (entry && isRoute(route)) props[route] = { component, props: entry.props };
  }

  cachedIndex = buildSearchIndex({
    sections: getSections(),
    describe: (route) => metaForRoute(route).description,
    steps: GUIDE_STEPS,
    props,
  });

  return cachedIndex;
}

function hrefOf(entry: SearchEntry): string {
  const path = routeToPath(entry.route);

  return entry.hash ? `${path}#${entry.hash}` : path;
}

function shortcutLabel(): string {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  return isMac ? '⌘K' : 'Ctrl K';
}

export interface SearchBoxProps {
  theme: ChartTheme;
  mobile: boolean;
  onNavigate: (route: Route, hash?: string) => void;
  /** Lets the app focus the box from the ⌘K shortcut. */
  inputRef?: RefObject<HTMLInputElement>;
  autoFocus?: boolean;
}

export function SearchBox({ theme, mobile, onNavigate, inputRef, autoFocus = false }: SearchBoxProps) {
  const ownRef = useRef<HTMLInputElement>(null);
  const input = inputRef ?? ownRef;
  const box = useRef<HTMLLabelElement>(null);
  const listId = useId();

  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  const groups = useMemo(() => (query.trim() === '' ? [] : searchDocs(docsIndex(), query)), [query]);
  const hits = useMemo(() => groups.flatMap((group) => group.entries), [groups]);
  const open = focused && query.trim() !== '';

  // Index of each group's first entry in `hits`, for keyboard selection.
  const groupStarts = useMemo(() => {
    const starts: number[] = [];
    let next = 0;

    for (const group of groups) {
      starts.push(next);
      next += group.entries.length;
    }

    return starts;
  }, [groups]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  // The popup is portaled to <body> because the sidebar clips its overflow, so
  // it follows the field's box instead of the layout.
  useEffect(() => {
    if (!open) return;

    const measure = () => setAnchor(box.current?.getBoundingClientRect() ?? null);
    measure();
    window.addEventListener('resize', measure);

    return () => window.removeEventListener('resize', measure);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, listId]);

  const select = (entry: SearchEntry) => {
    onNavigate(entry.route, entry.hash);
    setQuery('');
    input.current?.blur();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => Math.min(hits.length - 1, Math.max(0, i + step)));

      return;
    }

    if (e.key === 'Enter') {
      const hit = hits[active];
      if (!hit) return;

      e.preventDefault();
      select(hit);

      return;
    }

    if (e.key === 'Escape') {
      if (query) {
        setQuery('');
      } else {
        input.current?.blur();
      }
    }
  };

  const onHitClick = (e: MouseEvent<HTMLAnchorElement>, entry: SearchEntry) => {
    const modified = e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
    if (modified) return;

    e.preventDefault();
    select(entry);
  };

  const border = theme.tooltip.borderColor;
  const muted = theme.axis.textColor;
  const activeBg = hexToRgba(saturate(theme.line.color, 0.55), 0.16);
  const fontSize = mobile ? theme.typography.fontSize + 1 : theme.typography.fontSize;

  return (
    <div style={{ position: 'relative', padding: mobile ? '10px 14px 2px' : '10px 10px 2px' }}>
      <label
        ref={box}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: mobile ? 38 : 32,
          padding: '0 8px 0 10px',
          border: `1px solid ${focused ? hexToRgba(theme.line.color, 0.6) : border}`,
          borderRadius: 8,
          color: muted,
          cursor: 'text',
          transition: 'border-color 0.15s',
        }}
      >
        <Search size={14} aria-hidden />
        <input
          ref={input}
          // Not type="search": Chrome would add its own clear button beside ours.
          type="text"
          enterKeyHint="search"
          value={query}
          placeholder="Search docs"
          aria-label="Search docs"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && hits.length > 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          // biome-ignore lint/a11y/noAutofocus: only when the reader asked for search via the shortcut.
          autoFocus={autoFocus}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
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
            fontSize,
            fontFamily: 'inherit',
          }}
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setQuery('')}
            style={{
              display: 'flex',
              padding: 2,
              border: 'none',
              background: 'transparent',
              color: muted,
              cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        ) : (
          !mobile && (
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
          )
        )}
      </label>

      {open &&
        anchor &&
        createPortal(
          <div
            id={listId}
            role="listbox"
            aria-label="Search results"
            onMouseDown={(e) => e.preventDefault()}
            style={{
              position: 'fixed',
              top: anchor.bottom + 6,
              left: anchor.left,
              width: mobile ? anchor.width : Math.min(POPUP_WIDTH, window.innerWidth - anchor.left - 16),
              maxHeight: Math.min(window.innerHeight * 0.7, window.innerHeight - anchor.bottom - 16),
              overflowY: 'auto',
              zIndex: 300,
              padding: 6,
              borderRadius: 10,
              border: `1px solid ${border}`,
              background: theme.tooltip.background,
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              boxShadow: '0 16px 40px rgba(0, 0, 0, 0.35)',
              color: theme.tooltip.textColor,
              fontFamily: theme.typography.fontFamily,
              fontSize,
            }}
          >
            {hits.length === 0 && <div style={{ padding: '12px 10px', color: muted }}>No results for “{query}”</div>}

            {groups.map((group, groupIndex) => (
              <div key={group.kind}>
                <div
                  style={{
                    padding: '8px 10px 4px',
                    fontSize: fontSize - 2,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: muted,
                  }}
                >
                  {group.title}
                </div>
                {group.entries.map((entry, entryIndex) => {
                  const index = groupStarts[groupIndex] + entryIndex;
                  const selected = index === active;

                  return (
                    <a
                      key={`${entry.route}#${entry.hash ?? ''}:${entry.label}`}
                      id={`${listId}-${index}`}
                      role="option"
                      aria-selected={selected}
                      href={hrefOf(entry)}
                      onClick={(e) => onHitClick(e, entry)}
                      onMouseEnter={() => setActive(index)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                        padding: '7px 10px',
                        borderRadius: 6,
                        background: selected ? activeBg : 'transparent',
                        color: 'inherit',
                        textDecoration: 'none',
                      }}
                    >
                      <span style={{ fontWeight: 500, fontFamily: entry.kind === 'prop' ? MONO : 'inherit' }}>
                        {entry.label}
                      </span>
                      <span style={{ fontSize: fontSize - 1, color: muted }}>{entry.hint}</span>
                    </a>
                  );
                })}
              </div>
            ))}

            {!mobile && hits.length > 0 && (
              <div
                style={{
                  padding: '8px 10px 4px',
                  borderTop: `1px solid ${border}`,
                  marginTop: 4,
                  fontSize: fontSize - 2,
                  color: muted,
                }}
              >
                ↑ ↓ to move · Enter to open · Esc to close
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
