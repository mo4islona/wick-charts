import { useEffect, useState } from 'react';

import { type ChartTheme, ThemeProvider, themes } from '@wick-charts/react';
import { type Route, Sidebar } from './components/Sidebar';
import { ThemeSelect } from './components/ThemeSelect';
import { BarPage } from './pages/BarPage';
import { CandlestickPage } from './pages/CandlestickPage';
import { DashboardPage } from './pages/DashboardPage';
import { LinePage } from './pages/LinePage';
import { PiePage } from './pages/PiePage';
import { ThemePage } from './pages/ThemePage';

const PAGES: Record<Route, React.FC<{ theme: ChartTheme }>> = {
  dashboard: DashboardPage,
  candlestick: CandlestickPage,
  line: LinePage,
  bar: BarPage,
  pie: PiePage,
  theme: ThemePage,
};

const TITLES: Record<Route, string> = {
  dashboard: '',
  candlestick: 'Candlestick Charts',
  line: 'Line & Area Charts',
  bar: 'Bar Charts',
  pie: 'Pie & Donut Charts',
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

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true');

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

  return (
    <ThemeProvider value={theme}>
      <div
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          backgroundColor: theme.background,
          backgroundImage: (() => {
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
          })(),
          fontFamily: theme.typography.fontFamily,
          color: theme.tooltip.textColor,
          transition: 'background 0.3s ease',
        }}
      >
        {/* Sidebar */}
        <Sidebar
          route={route}
          onNavigate={navigate}
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
          theme={theme}
        />

        {/* Main area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Header */}
          <div
            style={{
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <h1
              style={{
                margin: 0,
                fontSize: theme.typography.fontSize + 4,
                fontWeight: 600,
                letterSpacing: '-0.01em',
              }}
            >
              {pageTitle}
            </h1>

            <ThemeSelect value={themeName} onChange={setThemeName} theme={theme} />
          </div>

          {/* Page content */}
          <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
            <Page theme={theme} />
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}
