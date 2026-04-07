import { useEffect, useState } from 'react';

import { type ChartTheme, ThemeProvider, themes } from '@wick-charts/react';

import { type Route, Sidebar } from './components/Sidebar';
import { ThemeSelect } from './components/ThemeSelect';
import { FrameworkProvider } from './context/framework';
import { useFrameworkState } from './hooks/useFramework';
import { useIsMobile } from './hooks/useIsMobile';
import { BarPage } from './pages/BarPage';
import { CandlestickPage } from './pages/CandlestickPage';
import { DashboardPage } from './pages/DashboardPage';
import { LinePage } from './pages/LinePage';
import { PiePage } from './pages/PiePage';
import { SparklinePage } from './pages/SparklinePage';
import { ThemePage } from './pages/ThemePage';

const PAGES: Record<Route, React.FC<{ theme: ChartTheme }>> = {
  dashboard: DashboardPage,
  candlestick: CandlestickPage,
  line: LinePage,
  bar: BarPage,
  pie: PiePage,
  sparkline: SparklinePage,
  theme: ThemePage,
};

const TITLES: Record<Route, string> = {
  dashboard: '',
  candlestick: 'Candlestick Charts',
  line: 'Line & Area Charts',
  bar: 'Bar Charts',
  pie: 'Pie & Donut Charts',
  sparkline: 'Sparklines',
  theme: 'Custom Theme',
};

function isRoute(s: string): s is Route {
  return s in PAGES;
}

function useHashRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => {
    const h = window.location.hash.slice(1);
    return isRoute(h) ? h : 'dashboard';
  });

  useEffect(() => {
    const handler = () => {
      const h = window.location.hash.slice(1);
      if (isRoute(h)) setRoute(h);
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const navigate = (r: Route) => {
    window.location.hash = r;
  };

  return [route, navigate];
}

export default function App() {
  const [themeName, setThemeName] = useState(() => {
    const saved = localStorage.getItem('chart-theme');
    return saved && themes[saved] ? saved : 'Night Owl';
  });

  const [route, navigate] = useHashRoute();

  const mobile = useIsMobile();
  const [framework, setFramework] = useFrameworkState();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('chart-theme', themeName);
  }, [themeName]);
  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(collapsed));
  }, [collapsed]);

  const preset = themes[themeName];
  const theme = preset.theme;

  // Load font + set root styles
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
    document.body.style.background = theme.background;
  }, [themeName]);

  const Page = PAGES[route];
  const pageTitle = TITLES[route];

  const bgImage = (() => {
    const major = preset.dark ? 0.06 : 0.12;
    const minor = preset.dark ? 0.03 : 0.06;
    return [
      preset.backgroundImage,
      `repeating-linear-gradient(0deg, transparent, transparent 129px, rgba(150,150,150,${major}) 129px, rgba(150,150,150,${major}) 130px)`,
      `repeating-linear-gradient(90deg, transparent, transparent 129px, rgba(150,150,150,${major}) 129px, rgba(150,150,150,${major}) 130px)`,
      `repeating-linear-gradient(0deg, transparent, transparent 25px, rgba(150,150,150,${minor}) 25px, rgba(150,150,150,${minor}) 26px)`,
      `repeating-linear-gradient(90deg, transparent, transparent 25px, rgba(150,150,150,${minor}) 25px, rgba(150,150,150,${minor}) 26px)`,
    ]
      .filter(Boolean)
      .join(', ');
  })();

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
          {!mobile && (
            <Sidebar
              route={route}
              onNavigate={navigate}
              collapsed={collapsed}
              onToggle={() => setCollapsed((c) => !c)}
              theme={theme}
            />
          )}

          {/* Mobile overlay sidebar */}
          {mobile && mobileMenuOpen && (
            <>
              <div
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'rgba(0,0,0,0.5)',
                  zIndex: 200,
                }}
              />
              <div style={{ position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 201 }}>
                <Sidebar
                  route={route}
                  onNavigate={(r) => {
                    navigate(r);
                    setMobileMenuOpen(false);
                  }}
                  collapsed={false}
                  onToggle={() => setMobileMenuOpen(false)}
                  theme={theme}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                      width: 34,
                      height: 34,
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
                <h1
                  style={{
                    margin: 0,
                    fontSize: mobile ? theme.typography.fontSize + 2 : theme.typography.fontSize + 4,
                    fontWeight: 600,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {pageTitle}
                </h1>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: mobile ? 4 : 8 }}>
                {!mobile && (
                  <>
                    <a
                      href="https://github.com/mo4islona/wick-charts"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 38,
                        height: 38,
                        borderRadius: 6,
                        border: `1px solid ${theme.tooltip.borderColor}`,
                        background: 'transparent',
                        color: theme.tooltip.textColor,
                        opacity: 0.6,
                        transition: 'opacity 0.15s ease',
                        textDecoration: 'none',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = '1';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '0.6';
                      }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                      </svg>
                    </a>
                    <a
                      href="https://x.com/mo4islona"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 38,
                        height: 38,
                        borderRadius: 6,
                        border: `1px solid ${theme.tooltip.borderColor}`,
                        background: 'transparent',
                        color: theme.tooltip.textColor,
                        opacity: 0.6,
                        transition: 'opacity 0.15s ease',
                        textDecoration: 'none',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = '1';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '0.6';
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                    </a>
                  </>
                )}
                <ThemeSelect value={themeName} onChange={setThemeName} theme={theme} mobile={mobile} />
              </div>
            </div>

            {/* Page content */}
            <div style={{ flex: 1, minHeight: 0, padding: mobile ? 4 : 6, overflow: 'auto' }}>
              <Page theme={theme} />
            </div>
          </div>
        </div>
      </FrameworkProvider>
    </ThemeProvider>
  );
}
