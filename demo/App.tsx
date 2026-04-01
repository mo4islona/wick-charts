import { useEffect, useState } from "react";
import { themes } from "../src";
import type { ChartTheme } from "../src/theme/types";
import { type Route, Sidebar } from "./components/Sidebar";
import { ThemeSelect } from "./components/ThemeSelect";
import { BarPage } from "./pages/BarPage";
import { CandlestickPage } from "./pages/CandlestickPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LinePage } from "./pages/LinePage";
import { darken } from "./utils";

const PAGES: Record<Route, React.FC<{ theme: ChartTheme }>> = {
  dashboard: DashboardPage,
  candlestick: CandlestickPage,
  line: LinePage,
  bar: BarPage,
};

const TITLES: Record<Route, string> = {
  dashboard: "Dashboard",
  candlestick: "Candlestick Charts",
  line: "Line & Area Charts",
  bar: "Bar Charts",
};

function isRoute(s: string): s is Route {
  return s in PAGES;
}

function useHashRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => {
    const h = window.location.hash.slice(1);
    return isRoute(h) ? h : "dashboard";
  });

  useEffect(() => {
    const handler = () => {
      const h = window.location.hash.slice(1);
      if (isRoute(h)) setRoute(h);
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  const navigate = (r: Route) => {
    window.location.hash = r;
  };

  return [route, navigate];
}

export default function App() {
  const [themeName, setThemeName] = useState(() => {
    const saved = localStorage.getItem("chart-theme");
    return saved && themes[saved] ? saved : "Night Owl";
  });

  const [route, navigate] = useHashRoute();

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");

  useEffect(() => {
    localStorage.setItem("chart-theme", themeName);
  }, [themeName]);
  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  const preset = themes[themeName];
  const theme = preset.theme;

  // Load font + set root styles
  useEffect(() => {
    if (preset.fontUrl) {
      const id = `font-${themeName.replace(/\s/g, "-")}`;
      if (!document.getElementById(id)) {
        const link = document.createElement("link");
        link.id = id;
        link.rel = "stylesheet";
        link.href = preset.fontUrl;
        document.head.appendChild(link);
      }
    }
    document.documentElement.style.fontSize = `${theme.typography.fontSize}px`;
    document.documentElement.style.fontFamily = theme.typography.fontFamily;
  }, [themeName]);

  const Page = PAGES[route];

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        background: darken(theme.background, 0.15),
        fontFamily: theme.typography.fontFamily,
        color: theme.tooltip.textColor,
        transition: "background 0.3s ease",
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
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Header */}
        <div
          style={{
            padding: "8px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: `1px solid ${theme.tooltip.borderColor}`,
            flexShrink: 0,
          }}
        >
          <h1 style={{ margin: 0, fontSize: theme.typography.fontSize + 4, fontWeight: 600, letterSpacing: "-0.01em" }}>
            {TITLES[route]}
          </h1>
          <ThemeSelect value={themeName} onChange={setThemeName} theme={theme} />
        </div>

        {/* Page content */}
        <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
          <Page theme={theme} />
        </div>
      </div>
    </div>
  );
}
