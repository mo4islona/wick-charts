// Centralised route table — sidebar groups, page titles, and hash-route
// validation all read from here so adding/renaming a page is a one-file change.

import {
  Activity,
  Anchor,
  BarChart3,
  CandlestickChart,
  Crosshair as CrosshairIcon,
  FileText,
  FlaskConical,
  Frame,
  GitBranch,
  Grid3x3,
  Hash,
  Heading1,
  LayoutDashboard,
  type LucideIcon,
  Map as MapIcon,
  MessageSquare,
  Palette,
  PieChart,
  Sigma,
  Tag,
  TrendingUp,
  Type,
} from 'lucide-react';

export type Route =
  | 'overview'
  | 'migration'
  | 'charts/candlestick'
  | 'charts/line'
  | 'charts/bar'
  | 'charts/pie'
  | 'charts/sparkline'
  | 'api/line-series'
  | 'api/bar-series'
  | 'api/candlestick-series'
  | 'api/pie-series'
  | 'api/sparkline'
  | 'api/chart-container'
  | 'api/x-axis'
  | 'api/y-axis'
  | 'api/tooltip'
  | 'api/crosshair'
  | 'api/legend'
  | 'api/navigator'
  | 'api/title'
  | 'api/info-bar'
  | 'api/pie-legend'
  | 'api/pie-tooltip'
  | 'api/number-flow'
  | 'api/y-label'
  | 'hooks/use-chart-instance'
  | 'hooks/use-theme'
  | 'hooks/use-crosshair-position'
  | 'hooks/use-last-y-value'
  | 'hooks/use-previous-close'
  | 'hooks/use-visible-range'
  | 'hooks/use-y-range'
  | 'customization/theme'
  | 'stress-test';

export interface RouteEntry {
  route: Route;
  label: string;
  /** Lucide icon — section items use this; section headers don't. */
  icon?: LucideIcon;
  /**
   * Title shown in the App-level page header. Empty when the page renders
   * its own header (e.g. ApiPage, HookPage) — keeps us from showing the
   * component name twice.
   */
  title: string;
}

export interface RouteSection {
  /** `null` = ungrouped (rendered without a header). */
  heading: string | null;
  items: RouteEntry[];
}

/**
 * Backwards-compatible aliases for the old hash routes. When someone lands
 * on an old URL we silently rewrite the hash to the new path.
 *
 * Two generations of aliases live here:
 *   1. The pre-restructure single-key form (`#dashboard`, `#line`, `#theme`).
 *   2. The first-restructure `components/*` paths, now renamed to `charts/*`.
 */
export const ROUTE_ALIASES: Record<string, Route> = {
  // pre-restructure
  dashboard: 'overview',
  candlestick: 'charts/candlestick',
  line: 'charts/line',
  bar: 'charts/bar',
  pie: 'charts/pie',
  sparkline: 'charts/sparkline',
  theme: 'customization/theme',
  // pre-rename (Components → Charts)
  'components/candlestick': 'charts/candlestick',
  'components/line': 'charts/line',
  'components/bar': 'charts/bar',
  'components/pie': 'charts/pie',
  'components/sparkline': 'charts/sparkline',
};

const CHARTS: RouteEntry[] = [
  { route: 'charts/candlestick', label: 'Candlestick', icon: CandlestickChart, title: 'Candlestick' },
  { route: 'charts/line', label: 'Line & Area', icon: TrendingUp, title: 'Line & Area' },
  { route: 'charts/bar', label: 'Bar', icon: BarChart3, title: 'Bar' },
  { route: 'charts/pie', label: 'Pie & Donut', icon: PieChart, title: 'Pie & Donut' },
  { route: 'charts/sparkline', label: 'Sparkline', icon: Activity, title: 'Sparkline' },
];

// API entries own their own header (rendered by ApiPage), so the App-level
// title is left blank to avoid the "PieLegend / PieLegend" duplication.
// Entries are sorted alphabetically by label — the API list is reference,
// not curriculum, so a flat A→Z makes it scannable.
const API: RouteEntry[] = [
  { route: 'api/bar-series', label: 'BarSeries', icon: BarChart3, title: '' },
  { route: 'api/candlestick-series', label: 'CandlestickSeries', icon: CandlestickChart, title: '' },
  { route: 'api/chart-container', label: 'ChartContainer', icon: Frame, title: '' },
  { route: 'api/crosshair', label: 'Crosshair', icon: CrosshairIcon, title: '' },
  { route: 'api/info-bar', label: 'InfoBar', icon: FileText, title: '' },
  { route: 'api/legend', label: 'Legend', icon: Tag, title: '' },
  { route: 'api/line-series', label: 'LineSeries', icon: TrendingUp, title: '' },
  { route: 'api/navigator', label: 'Navigator', icon: MapIcon, title: '' },
  { route: 'api/number-flow', label: 'NumberFlow', icon: Sigma, title: '' },
  { route: 'api/pie-legend', label: 'PieLegend', icon: Tag, title: '' },
  { route: 'api/pie-series', label: 'PieSeries', icon: PieChart, title: '' },
  { route: 'api/pie-tooltip', label: 'PieTooltip', icon: MessageSquare, title: '' },
  { route: 'api/sparkline', label: 'Sparkline', icon: Activity, title: '' },
  { route: 'api/title', label: 'Title', icon: Heading1, title: '' },
  { route: 'api/tooltip', label: 'Tooltip', icon: MessageSquare, title: '' },
  { route: 'api/x-axis', label: 'XAxis', icon: Grid3x3, title: '' },
  { route: 'api/y-axis', label: 'YAxis', icon: Grid3x3, title: '' },
  { route: 'api/y-label', label: 'YLabel', icon: Type, title: '' },
];

// Hook pages render their own H2, so leave the App-level title blank.
const HOOKS: RouteEntry[] = [
  { route: 'hooks/use-chart-instance', label: 'useChartInstance', icon: Anchor, title: '' },
  { route: 'hooks/use-theme', label: 'useTheme', icon: Hash, title: '' },
  { route: 'hooks/use-crosshair-position', label: 'useCrosshairPosition', icon: Hash, title: '' },
  { route: 'hooks/use-last-y-value', label: 'useLastYValue', icon: Hash, title: '' },
  { route: 'hooks/use-previous-close', label: 'usePreviousClose', icon: Hash, title: '' },
  { route: 'hooks/use-visible-range', label: 'useVisibleRange', icon: Hash, title: '' },
  { route: 'hooks/use-y-range', label: 'useYRange', icon: Hash, title: '' },
];

const CUSTOMIZATION: RouteEntry[] = [
  { route: 'customization/theme', label: 'Theme', icon: Palette, title: 'Custom Theme' },
];

const OVERVIEW: RouteEntry = { route: 'overview', label: 'Overview', icon: LayoutDashboard, title: '' };
const MIGRATION: RouteEntry = {
  route: 'migration',
  label: 'Migration Guide',
  icon: GitBranch,
  title: 'Migration Guide',
};
const STRESS: RouteEntry = { route: 'stress-test', label: 'Stress', icon: FlaskConical, title: 'Stress Tests' };

const BASE_SECTIONS: RouteSection[] = [
  { heading: null, items: [OVERVIEW, MIGRATION] },
  { heading: 'Charts', items: CHARTS },
  { heading: 'API', items: API },
  { heading: 'Hooks', items: HOOKS },
  { heading: 'Customization', items: CUSTOMIZATION },
];

export function getSections(dev: boolean): RouteSection[] {
  if (!dev) return BASE_SECTIONS;

  return [...BASE_SECTIONS, { heading: 'Internal', items: [STRESS] }];
}

const ALL_ENTRIES: RouteEntry[] = [OVERVIEW, MIGRATION, ...CHARTS, ...API, ...HOOKS, ...CUSTOMIZATION, STRESS];

const ROUTES_SET = new Set<string>(ALL_ENTRIES.map((e) => e.route));

export function isRoute(s: string): s is Route {
  return ROUTES_SET.has(s);
}

export function getTitle(route: Route): string {
  const entry = ALL_ENTRIES.find((e) => e.route === route);

  return entry?.title ?? '';
}

/**
 * Section heading for a given route — used by the breadcrumb on subcomponent
 * and chart pages. Returns `null` for top-level routes (Overview).
 */
export function getSection(route: Route): string | null {
  for (const section of BASE_SECTIONS) {
    if (section.items.some((i) => i.route === route)) return section.heading;
  }

  return null;
}

/** Charts API → Charts demo route mapping (used for the "↗ See demos" cross-link). */
export const CHART_API_TO_DEMO: Record<string, Route> = {
  'api/line-series': 'charts/line',
  'api/bar-series': 'charts/bar',
  'api/candlestick-series': 'charts/candlestick',
  'api/pie-series': 'charts/pie',
  'api/sparkline': 'charts/sparkline',
};

/**
 * Derive the canonical React hook name from a `hooks/<slug>` route — single
 * source of truth for App.tsx (dispatch) and Sidebar.tsx (per-framework
 * label swap), so adding/renaming a hook only requires updating the route
 * table here.
 *
 *   "hooks/use-chart-instance" → "useChartInstance"
 */
export function hookKeyForRoute(route: Route): string | null {
  if (!route.startsWith('hooks/')) return null;
  const slug = route.slice('hooks/'.length);

  return slug.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}
