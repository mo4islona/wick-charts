import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  type ChartTheme,
  type ThemePreset,
  ThemeProvider,
  createTheme,
  resolveCandlestickBodyColor,
} from '@wick-charts/react';

import { Sidebar } from './components/Sidebar';
import { ThemeSelect } from './components/ThemeSelect';
import { type JsonValue, normalizeThemeConfig, themeToJson } from './components/theme-editor/themeJson';
import { FrameworkProvider } from './context/framework';
import { applyRouteMeta } from './head';
import { useFrameworkState } from './hooks/useFramework';
import { useIsMobile } from './hooks/useIsMobile';
import { ApiRoutePage } from './pages/api';
import { ChartRoutePage } from './pages/charts';
import { HookPage } from './pages/HookPage';
import { MigrationPage } from './pages/MigrationPage';
import { OverviewPage } from './pages/OverviewPage';
import { StressTestPage } from './pages/StressTestPage';
import { ThemePage } from './pages/ThemePage';
import { UseCasesRoutePage } from './pages/use-cases';
import { hashOf, resolveInternalPath, routeToPath, usePathRoute } from './router';
import { CHART_DEMO_TO_API, CHART_GUIDES, type Route, getTitle, hookKeyForRoute, labelForRoute } from './routes';
import { themes } from './themes';
import { gridBackgroundImage, hexToRgba, isDarkColor } from './utils';

// One height for every topbar control — hamburger, icon links, theme picker.
// They sit on a single row, so a 2px disagreement reads as misalignment.
const CONTROL_SIZE = 36;

function IconLink({ href, label, theme, children }: IconLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: CONTROL_SIZE,
        height: CONTROL_SIZE,
        borderRadius: 6,
        border: `1px solid ${theme.tooltip.borderColor}`,
        background: 'transparent',
        color: theme.tooltip.textColor,
        opacity: 0.6,
        transition: 'opacity 0.15s ease',
        textDecoration: 'none',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.opacity = '1';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = '0.6';
      }}
    >
      {children}
    </a>
  );
}

const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

// Coding agents find llms.txt through a link far more often than by guessing the path.
function AgentLink({ theme }: { theme: ChartTheme }) {
  const [hover, setHover] = useState(false);
  const accent = resolveCandlestickBodyColor(theme.candlestick.up.body);

  return (
    <a
      href="/llms.txt"
      title="llms.txt — the docs index for AI agents"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        height: CONTROL_SIZE,
        padding: '0 8px',
        borderRadius: 6,
        background: hover ? hexToRgba(accent, 0.08) : 'transparent',
        color: hover ? accent : theme.tooltip.textColor,
        fontFamily: MONO,
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '-0.01em',
        textDecoration: 'none',
        whiteSpace: 'nowrap',
        transition: 'color 0.15s ease, background 0.15s ease',
      }}
    >
      <span style={{ opacity: hover ? 1 : 0.6 }}>Are you an AI agent?</span>
    </a>
  );
}

/** Keys typed into a field belong to it, not to the page shortcuts. */
function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const tag = target.tagName;
  const formField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

  return formField || target.isContentEditable;
}

/**
 * The guides and the API page for a chart, beside its title. Plain links, so
 * crawlers follow them from every chart page.
 */
function RelatedLinks({ route, theme, mobile = false }: { route: Route; theme: ChartTheme; mobile?: boolean }) {
  const guides = CHART_GUIDES[route] ?? [];
  const api = CHART_DEMO_TO_API[route];
  if (guides.length === 0 && !api) return null;

  const muted = theme.axis.textColor;
  const fontSize = theme.typography.fontSize - 1;

  return (
    <nav
      aria-label="Related pages"
      style={{
        display: 'flex',
        flexWrap: mobile ? 'wrap' : 'nowrap',
        alignItems: 'baseline',
        columnGap: 10,
        rowGap: 4,
        minWidth: 0,
        overflowX: mobile ? 'visible' : 'auto',
        scrollbarWidth: 'none',
        padding: mobile ? '0 12px 6px' : '0 0 0 12px',
        marginLeft: mobile ? 0 : 4,
        borderLeft: mobile ? 'none' : `1px solid ${theme.tooltip.borderColor}`,
        fontSize,
        color: muted,
      }}
    >
      {guides.length > 0 && <span style={{ whiteSpace: 'nowrap' }}>Guides:</span>}
      {guides.map((guide) => (
        <RelatedLink key={guide} route={guide} theme={theme} />
      ))}
      {api && (
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 10, whiteSpace: 'nowrap' }}>
          <span style={{ marginLeft: guides.length > 0 ? 6 : 0 }}>API:</span>
          <RelatedLink route={api} theme={theme} mono />
        </span>
      )}
    </nav>
  );
}

function RelatedLink({ route, theme, mono = false }: { route: Route; theme: ChartTheme; mono?: boolean }) {
  return (
    <a
      href={routeToPath(route)}
      style={{
        color: theme.tooltip.textColor,
        fontFamily: mono ? MONO : 'inherit',
        textDecoration: 'none',
        whiteSpace: 'nowrap',
        opacity: 0.8,
        transition: 'opacity 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.opacity = '1';
        e.currentTarget.style.textDecoration = 'underline';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = '0.8';
        e.currentTarget.style.textDecoration = 'none';
      }}
    >
      {labelForRoute(route)}
    </a>
  );
}

interface IconLinkProps {
  href: string;
  label: string;
  theme: ChartTheme;
  children: React.ReactNode;
}

interface RenderArgs {
  route: Route;
  theme: ChartTheme;
  baseTheme: ChartTheme;
  editorValue: JsonValue;
  onEditorChange: (next: JsonValue) => void;
}

function renderRoute({ route, theme, baseTheme, editorValue, onEditorChange }: RenderArgs) {
  if (route === 'overview') return <OverviewPage theme={theme} />;
  if (route === 'migration') return <MigrationPage theme={theme} />;
  if (route === 'use-cases/theme') {
    return <ThemePage theme={baseTheme} value={editorValue} onChange={onEditorChange} />;
  }
  if (route === 'stress-test') return <StressTestPage theme={theme} />;
  if (route.startsWith('charts/')) return <ChartRoutePage route={route} theme={theme} />;
  if (route.startsWith('use-cases/')) return <UseCasesRoutePage route={route} theme={theme} />;
  if (route.startsWith('api/')) return <ApiRoutePage route={route} theme={theme} />;

  const hookKey = hookKeyForRoute(route);
  if (hookKey) return <HookPage hookKey={hookKey} theme={theme} />;

  return null;
}

export default function App() {
  const [themeName, setThemeName] = useState(() => {
    const saved = localStorage.getItem('chart-theme');
    if (saved && themes[saved]) return saved;

    const prefersDark =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;

    return prefersDark ? 'Catppuccin' : 'Quiet Light';
  });

  const [route, navigate] = usePathRoute();

  const mobile = useIsMobile();
  const [framework, setFramework] = useFrameworkState();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [focusSearchOnOpen, setFocusSearchOnOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  // `seq` makes a repeat jump to the same id (e.g. two searches for one prop) re-run the effect.
  const [scrollTarget, setScrollTarget] = useState<{ id: string; seq: number } | null>(null);

  const navigateTo = useCallback(
    (next: Route, hash?: string) => {
      navigate(next, hash);
      setMobileMenuOpen(false);

      if (hash) setScrollTarget((prev) => ({ id: hash, seq: (prev?.seq ?? 0) + 1 }));
    },
    [navigate],
  );

  useEffect(() => {
    localStorage.setItem('chart-theme', themeName);
  }, [themeName]);

  // Keep <title>, meta description, canonical and social tags in sync with the
  // route — both for live navigation and for what the prerender crawler freezes.
  // The data attribute is a route-tagged readiness signal for the crawler: it
  // waits for the value to equal the route it requested, which guarantees the
  // head + content have switched even when the SPA-fallback shell it was served
  // happened to be a different prerendered page.
  useEffect(() => {
    applyRouteMeta(route);
    document.documentElement.setAttribute('data-prerender-route', route);
  }, [route]);

  // Turn same-origin <a href="/route"> clicks into SPA navigations so the
  // sidebar, logo and cross-links stay real (crawlable) links while behaving
  // like a router. Modified clicks (new tab, etc.) keep the browser default.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const target = e.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest('a');
      if (!anchor || anchor.getAttribute('target') === '_blank') return;

      const href = anchor.getAttribute('href');
      if (!href) return;

      const next = resolveInternalPath(href);
      if (!next) return;

      e.preventDefault();
      navigateTo(next, hashOf(href));
    };

    document.addEventListener('click', onClick);

    return () => document.removeEventListener('click', onClick);
  }, [navigateTo]);

  // A deep link opened in a new tab: the browser's own jump runs before React
  // has rendered the target, so repeat it once the page is up.
  useEffect(() => {
    const id = hashOf(window.location.href);
    if (id) setScrollTarget({ id, seq: 0 });
  }, []);

  useEffect(() => {
    if (!scrollTarget) return;

    const frame = requestAnimationFrame(() => {
      document.getElementById(scrollTarget.id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });

    return () => cancelAnimationFrame(frame);
  }, [scrollTarget]);

  // ⌘K / Ctrl+K, or `/` outside a text field, jumps to the docs search.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const shortcut = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      const slash = e.key === '/' && !e.metaKey && !e.ctrlKey && !isTextField(e.target);
      if (!shortcut && !slash) return;

      e.preventDefault();

      if (mobile) {
        setFocusSearchOnOpen(true);
        setMobileMenuOpen(true);

        return;
      }

      searchRef.current?.focus();
      searchRef.current?.select();
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobile]);

  // Close the mobile drawer after any navigation (links no longer call a
  // close handler directly — navigation flows through the click interceptor).
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [route]);

  useEffect(() => {
    if (!mobileMenuOpen) setFocusSearchOnOpen(false);
  }, [mobileMenuOpen]);

  const preset = themes[themeName];
  const baseTheme = preset.theme;

  // The editor's controlled JSON. `null` = no edits, show preset. Lives here
  // so edits persist across navigation (Dashboard → Theme → back) and across
  // browser restarts (via localStorage).
  const [editorJson, setEditorJson] = useState<JsonValue | null>(() => {
    try {
      const raw = localStorage.getItem('theme-editor-json');
      if (!raw) return null;

      return JSON.parse(raw) as JsonValue;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (editorJson === null) {
        localStorage.removeItem('theme-editor-json');
      } else {
        localStorage.setItem('theme-editor-json', JSON.stringify(editorJson));
      }
    } catch {
      // ignore quota / disabled storage
    }
  }, [editorJson]);

  const baseJson = useMemo<JsonValue>(() => themeToJson(baseTheme), [baseTheme]);
  const editorValue = editorJson ?? baseJson;

  // Derive the whole-page override from the edited JSON via createTheme.
  // `normalizeThemeConfig` coerces `background` / `line.color` to hex — the
  // editor accepts rgb/rgba/hsl/hsla, but createTheme's derivations
  // (isDarkBg, hexToRgba) assume `#RRGGBB`. Invalid JSON falls back to
  // `null` so previews don't crash.
  const override = useMemo<ChartTheme | null>(() => {
    if (!editorJson) return null;
    const cfg = normalizeThemeConfig(editorJson);
    if (!cfg) return null;
    try {
      return createTheme(cfg).theme;
    } catch {
      return null;
    }
  }, [editorJson]);

  const theme = override ?? baseTheme;
  const isDarkActive = useMemo(() => isDarkColor(theme.background), [theme.background]);

  // The preset handed to <ThemeSelect>. For the custom case we spread the base
  // and swap `theme`, so `value.name` keeps pointing at the base preset and
  // ThemeSelect can derive `isCustom` via a reference check.
  const currentPreset = useMemo<ThemePreset>(
    () => (override ? { ...preset, theme: override } : preset),
    [preset, override],
  );

  const pickPreset = useCallback((next: ThemePreset) => {
    setThemeName(next.name);
    setEditorJson(null);
  }, []);

  const onEditorChange = (next: JsonValue) => {
    // Clear the override when edits round-trip back to the preset baseline.
    setEditorJson(JSON.stringify(next) === JSON.stringify(baseJson) ? null : next);
  };

  // Load font + set root styles — tracks the ACTIVE theme so custom edits
  // propagate to document-level styling (body bg, root font, page glow).
  useEffect(() => {
    if (preset.fontUrl) {
      const id = `font-${themeName.replace(/\s/g, '-')}`;
      if (!document.getElementById(id)) {
        const link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href = preset.fontUrl;
        document.head.appendChild(link);
      }
    }
    document.documentElement.style.fontSize = `${theme.typography.fontSize}px`;
    document.documentElement.style.fontFamily = theme.typography.fontFamily;
    document.body.style.backgroundColor = theme.background;
    const glow = isDarkActive ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)';
    document.body.style.setProperty('--page-glow', glow);

    // Keep the pre-paint theme guard (inline script in index.html) in sync:
    // persist the resolved background + font URL so the next load paints the
    // right background and starts the font download before React boots, and
    // reveal the body now that the correct theme is rendered.
    localStorage.setItem('chart-theme-bg', theme.background);
    if (preset.fontUrl) {
      localStorage.setItem('chart-theme-font', preset.fontUrl);
    } else {
      localStorage.removeItem('chart-theme-font');
    }
    document.documentElement.style.background = theme.background;
    document.documentElement.classList.remove('theme-boot');
  }, [themeName, theme, preset.fontUrl, isDarkActive]);

  const pageTitle = getTitle(route);

  const bgImage = [preset.backgroundImage, gridBackgroundImage(isDarkActive)].filter(Boolean).join(', ');

  const fwCtx = { framework, setFramework };

  return (
    <ThemeProvider value={theme}>
      <FrameworkProvider value={fwCtx}>
        <div
          style={{
            width: '100%',
            height: '100vh',
            display: 'flex',
            backgroundColor: theme.background,
            backgroundImage: bgImage,
            fontFamily: theme.typography.fontFamily,
            color: theme.tooltip.textColor,
            transition: 'background 0.3s ease',
            overflow: 'hidden',
          }}
        >
          {/* Sidebar — hidden on mobile, shown on desktop */}
          {!mobile && <Sidebar route={route} theme={theme} onNavigate={navigateTo} searchRef={searchRef} />}

          {/* Mobile overlay sidebar */}
          {mobile && mobileMenuOpen && (
            <>
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'rgba(0,0,0,0.6)',
                  backdropFilter: 'blur(2px)',
                  WebkitBackdropFilter: 'blur(2px)',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  zIndex: 200,
                }}
              />
              <div style={{ position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 201 }}>
                <Sidebar
                  route={route}
                  onClose={() => setMobileMenuOpen(false)}
                  onNavigate={navigateTo}
                  autoFocusSearch={focusSearchOnOpen}
                  theme={theme}
                  mobile
                />
              </div>
            </>
          )}

          {/* Main area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {/* Header */}
            <div
              style={{
                padding: mobile ? '6px 10px' : '8px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                {/* Mobile hamburger */}
                {mobile && (
                  <button
                    type="button"
                    aria-label="Open navigation menu"
                    aria-expanded={mobileMenuOpen}
                    onClick={() => setMobileMenuOpen(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: CONTROL_SIZE,
                      height: CONTROL_SIZE,
                      borderRadius: 6,
                      border: `1px solid ${theme.tooltip.borderColor}`,
                      background: 'transparent',
                      color: theme.tooltip.textColor,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <line x1="2" y1="4" x2="14" y2="4" />
                      <line x1="2" y1="8" x2="14" y2="8" />
                      <line x1="2" y1="12" x2="14" y2="12" />
                    </svg>
                  </button>
                )}
                {pageTitle && (
                  <h1
                    style={{
                      margin: 0,
                      fontSize: mobile ? theme.typography.fontSize + 2 : theme.typography.fontSize + 4,
                      fontWeight: 600,
                      letterSpacing: '-0.01em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {pageTitle}
                  </h1>
                )}
                {!mobile && <RelatedLinks route={route} theme={theme} />}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: mobile ? 6 : 8 }}>
                {!mobile && <AgentLink theme={theme} />}
                <IconLink href="https://github.com/mo4islona/wick-charts" label="GitHub repository" theme={theme}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                </IconLink>

                {/* X is the one control mobile drops — the row already carries
                    hamburger + GitHub + theme picker at 390px. */}
                {!mobile && (
                  <IconLink href="https://x.com/mo4islona" label="X profile" theme={theme}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </IconLink>
                )}
                <ThemeSelect value={currentPreset} onChange={pickPreset} />
              </div>
            </div>

            {/* The title row has no room on a phone, so the links get their own row. */}
            {mobile && <RelatedLinks route={route} theme={theme} mobile />}

            {/* Page content */}
            <main style={{ flex: 1, minHeight: 0, padding: mobile ? 4 : 6, overflow: 'auto' }}>
              {renderRoute({
                route,
                theme,
                baseTheme,
                editorValue,
                onEditorChange,
              })}
            </main>
          </div>
        </div>
      </FrameworkProvider>
    </ThemeProvider>
  );
}
