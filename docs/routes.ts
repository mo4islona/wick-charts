// Centralised route table — sidebar groups, page titles, and hash-route
// validation all read from here so adding/renaming a page is a one-file change.

import type { Framework } from './context/framework';

export type Route =
  | 'overview'
  | 'migration'
  | 'charts/candlestick'
  | 'charts/line'
  | 'charts/band'
  | 'charts/bar'
  | 'charts/pie'
  | 'charts/heatmap'
  | 'charts/depth'
  | 'charts/sparkline'
  // TODO(use-cases): only realtime-data and multi-chart-sync ship today. Page
  // files for 'use-cases/load-on-scroll' and 'use-cases/custom-overlay' live on
  // disk (docs/pages/use-cases/{load-on-scroll,custom-overlay}.tsx) and stay
  // unwired here intentionally — they need polish before going live. Re-enable
  // by adding the two route literals below and re-registering them in
  // docs/pages/use-cases/index.tsx.
  | 'use-cases/realtime-data'
  | 'use-cases/multi-chart-sync'
  | 'use-cases/custom-renders'
  | 'use-cases/custom-intro'
  | 'use-cases/annotations'
  | 'use-cases/data-loading'
  | 'use-cases/secondary-scale'
  | 'use-cases/x-axis-types'
  | 'use-cases/category-bars'
  | 'use-cases/theme'
  | 'integrations/shadcn'
  | 'integrations/shadcn/vue'
  | 'integrations/nuxt'
  | 'api/line-series'
  | 'api/band-series'
  | 'api/bar-series'
  | 'api/candlestick-series'
  | 'api/pie-series'
  | 'api/heatmap-series'
  | 'api/depth-series'
  | 'api/sparkline'
  | 'api/chart-container'
  | 'api/edge-loader'
  | 'api/reference-line'
  | 'api/time-region'
  | 'api/x-axis'
  | 'api/y-axis'
  | 'api/tooltip'
  | 'api/crosshair'
  | 'api/legend'
  | 'api/marker'
  | 'api/navigator'
  | 'api/title'
  | 'api/info-bar'
  | 'api/pie-legend'
  | 'api/pie-tooltip'
  | 'api/heatmap-tooltip'
  | 'api/number-flow'
  | 'api/y-label'
  | 'hooks/use-chart-instance'
  | 'hooks/use-theme'
  | 'hooks/use-crosshair-position'
  | 'hooks/use-last-y-value'
  | 'hooks/use-previous-close'
  | 'hooks/use-visible-range'
  | 'hooks/use-y-range'
  | 'stress-test';

export interface RouteEntry {
  route: Route;
  label: string;
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
  /** Leaf entries. Mutually exclusive with `subsections` — a section is
   *  either a flat list (Charts, Hooks) or a container of nested groups
   *  (API → Components + Hooks). */
  items?: RouteEntry[];
  /** Nested groups, each rendered with their own collapsible heading
   *  one indent level deeper than this section. */
  subsections?: RouteSection[];
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
  theme: 'use-cases/theme',
  // pre-rename (Components → Charts)
  'components/candlestick': 'charts/candlestick',
  'components/line': 'charts/line',
  'components/bar': 'charts/bar',
  'components/pie': 'charts/pie',
  'components/sparkline': 'charts/sparkline',
};

const CHARTS: RouteEntry[] = [
  { route: 'charts/candlestick', label: 'Candlestick', title: 'Candlestick' },
  { route: 'charts/line', label: 'Line & Area', title: 'Line & Area' },
  { route: 'charts/band', label: 'Band', title: 'Band' },
  { route: 'charts/bar', label: 'Bar', title: 'Bar' },
  { route: 'charts/pie', label: 'Pie & Donut', title: 'Pie & Donut' },
  { route: 'charts/heatmap', label: 'Heatmap', title: 'Heatmap' },
  { route: 'charts/depth', label: 'Order Book', title: 'Order Book' },
  { route: 'charts/sparkline', label: 'Sparkline', title: 'Sparkline' },
];

// Most needed first. URLs keep the `use-cases/` prefix: they are indexed and
// linked from the READMEs.
const GUIDES: RouteEntry[] = [
  { route: 'use-cases/realtime-data', label: 'Realtime Data', title: 'Realtime Data' },
  { route: 'use-cases/data-loading', label: 'Data loading', title: 'Data loading' },
  { route: 'use-cases/annotations', label: 'Annotations', title: 'Annotations' },
  { route: 'use-cases/multi-chart-sync', label: 'Multi-chart Sync', title: 'Multi-chart Sync' },
  { route: 'use-cases/secondary-scale', label: 'Secondary Y scale', title: 'Secondary Y scale' },
  { route: 'use-cases/category-bars', label: 'Category bars', title: 'Category bars' },
  { route: 'use-cases/x-axis-types', label: 'Numeric X axis', title: 'Numeric X axis' },
  { route: 'use-cases/custom-renders', label: 'Custom renders', title: 'Custom renders' },
  { route: 'use-cases/custom-intro', label: 'Custom intro animation', title: 'Custom intro animation' },
];

// API entries own their H1 (rendered by ApiPage), so the App-level
// title is left blank to avoid the "PieLegend / PieLegend" duplication.
// Split into two flat A→Z lists:
//   - `Charts` — series renderers (have a "↗ Try the live demo" link
//     to the matching `charts/*` route)
//   - `Components` — container, axes, overlays, formatters
// Both render under the API parent section in the sidebar.
const API_CHARTS: RouteEntry[] = [
  { route: 'api/band-series', label: 'BandSeries', title: '' },
  { route: 'api/bar-series', label: 'BarSeries', title: '' },
  { route: 'api/candlestick-series', label: 'CandlestickSeries', title: '' },
  { route: 'api/depth-series', label: 'DepthSeries', title: '' },
  { route: 'api/heatmap-series', label: 'HeatmapSeries', title: '' },
  { route: 'api/line-series', label: 'LineSeries', title: '' },
  { route: 'api/pie-series', label: 'PieSeries', title: '' },
  { route: 'api/sparkline', label: 'Sparkline', title: '' },
];

const API_COMPONENTS: RouteEntry[] = [
  { route: 'api/chart-container', label: 'ChartContainer', title: '' },
  { route: 'api/crosshair', label: 'Crosshair', title: '' },
  { route: 'api/edge-loader', label: 'EdgeLoader', title: '' },
  { route: 'api/heatmap-tooltip', label: 'HeatmapTooltip', title: '' },
  { route: 'api/info-bar', label: 'InfoBar', title: '' },
  { route: 'api/legend', label: 'Legend', title: '' },
  { route: 'api/marker', label: 'Marker', title: '' },
  { route: 'api/navigator', label: 'Navigator', title: '' },
  { route: 'api/number-flow', label: 'NumberFlow', title: '' },
  { route: 'api/pie-legend', label: 'PieLegend', title: '' },
  { route: 'api/pie-tooltip', label: 'PieTooltip', title: '' },
  { route: 'api/reference-line', label: 'ReferenceLine', title: '' },
  { route: 'api/time-region', label: 'TimeRegion', title: '' },
  { route: 'api/title', label: 'Title', title: '' },
  { route: 'api/tooltip', label: 'Tooltip', title: '' },
  { route: 'api/x-axis', label: 'XAxis', title: '' },
  { route: 'api/y-axis', label: 'YAxis', title: '' },
  { route: 'api/y-label', label: 'YLabel', title: '' },
];

/** Combined flat list — used by `getSection` / `isRoute` lookups. */
const API: RouteEntry[] = [...API_CHARTS, ...API_COMPONENTS];

// Hook pages render their own H1, so leave the App-level title blank.
const HOOKS: RouteEntry[] = [
  { route: 'hooks/use-chart-instance', label: 'useChartInstance', title: '' },
  { route: 'hooks/use-theme', label: 'useTheme', title: '' },
  { route: 'hooks/use-crosshair-position', label: 'useCrosshairPosition', title: '' },
  { route: 'hooks/use-last-y-value', label: 'useLastYValue', title: '' },
  { route: 'hooks/use-previous-close', label: 'usePreviousClose', title: '' },
  { route: 'hooks/use-visible-range', label: 'useVisibleRange', title: '' },
  { route: 'hooks/use-y-range', label: 'useYRange', title: '' },
];

const OVERVIEW: RouteEntry = { route: 'overview', label: 'Overview', title: '' };
// Title left blank — the markdown page already renders its own H1 ("Migration
// guide"), so showing it again in the topbar would duplicate.
const MIGRATION: RouteEntry = { route: 'migration', label: 'Migration Guide', title: '' };
// Theme editor lives at the bottom of the menu (a reference, not part of the main
// learning flow). Route stays `use-cases/theme` — only its menu slot moved.
const THEME: RouteEntry = { route: 'use-cases/theme', label: 'Theme editor', title: 'Theme editor' };
// How Wick Charts fits a framework or a UI kit around it, one page per integration.
const INTEGRATIONS: RouteEntry[] = [
  { route: 'integrations/shadcn', label: 'Shadcn', title: 'shadcn/ui' },
  { route: 'integrations/nuxt', label: 'Nuxt', title: 'Nuxt' },
];
// The shadcn page's Vue view: a URL of its own to prerender and rank, no menu item of its own.
const SHADCN_VUE: RouteEntry = { route: 'integrations/shadcn/vue', label: 'shadcn-vue', title: 'shadcn-vue' };
// Title blank — StressTestPage renders its own header (like Api/Hook/Migration),
// so a topbar title would double it up.
const STRESS: RouteEntry = { route: 'stress-test', label: 'Stress Tests', title: '' };

const BASE_SECTIONS: RouteSection[] = [
  { heading: null, items: [OVERVIEW] },
  { heading: 'Charts', items: CHARTS },
  { heading: 'Guides', items: GUIDES },
  { heading: 'Integrations', items: INTEGRATIONS },
  // Resources — references / tools (theme editor, migration guide, stress tests).
  // Sits above API and is expanded by default (see Sidebar's DEFAULT_OPEN). Stress
  // is no longer dev-gated.
  { heading: 'Resources', items: [THEME, MIGRATION, STRESS] },
  {
    heading: 'API',
    subsections: [
      { heading: 'Charts', items: API_CHARTS },
      { heading: 'Components', items: API_COMPONENTS },
      { heading: 'Hooks', items: HOOKS },
    ],
  },
];

export function getSections(): RouteSection[] {
  return BASE_SECTIONS;
}

const ALL_ENTRIES: RouteEntry[] = [
  OVERVIEW,
  MIGRATION,
  ...CHARTS,
  ...GUIDES,
  ...INTEGRATIONS,
  SHADCN_VUE,
  ...API,
  ...HOOKS,
  THEME,
  STRESS,
];

const ROUTES_SET = new Set<string>(ALL_ENTRIES.map((e) => e.route));

/**
 * Views of a page under their own URL, one per framework; the page's own URL shows React.
 * The docs framework selector picks the view.
 */
const FRAMEWORK_VIEWS: Partial<Record<Route, Partial<Record<Framework, Route>>>> = {
  'integrations/shadcn': { vue: 'integrations/shadcn/vue' },
};

interface ViewEntry {
  page: Route;
  framework: Framework;
}

const VIEWS = new Map<Route, ViewEntry>();
for (const [page, views] of Object.entries(FRAMEWORK_VIEWS) as [Route, Partial<Record<Framework, Route>>][]) {
  for (const [framework, view] of Object.entries(views) as [Framework, Route][]) {
    VIEWS.set(view, { page, framework });
  }
}

/** The menu item that shows `route`: the route itself, or the page it is a view of. */
export function menuRoute(route: Route): Route {
  return VIEWS.get(route)?.page ?? route;
}

/** The framework a view's URL is bound to, e.g. `vue` for the shadcn page's Vue URL. */
export function viewFramework(route: Route): Framework | undefined {
  return VIEWS.get(route)?.framework;
}

/** The URL of `route`'s page for `framework`: the page's view for it, or the page itself. */
export function routeForFramework(route: Route, framework: Framework): Route {
  const page = menuRoute(route);

  return FRAMEWORK_VIEWS[page]?.[framework] ?? page;
}

/** What a URL shows: a view as it is, a page with views as the view of the chosen framework. */
export function viewForUrl(route: Route, framework: Framework): Route {
  if (VIEWS.has(route)) return route;

  return routeForFramework(route, framework);
}

/** Menu items followed by the views of their pages, for lists of every URL such as llms.txt. */
export function withViews(items: RouteEntry[]): RouteEntry[] {
  return items.flatMap((item) => [item, ...ALL_ENTRIES.filter((entry) => VIEWS.get(entry.route)?.page === item.route)]);
}

export function isRoute(s: string): s is Route {
  return ROUTES_SET.has(s);
}

export function getTitle(route: Route): string {
  const entry = ALL_ENTRIES.find((e) => e.route === route);

  return entry?.title ?? '';
}

/** Sidebar label for a route (e.g. `'api/bar-series'` → `'BarSeries'`). */
export function labelForRoute(route: Route): string {
  const entry = ALL_ENTRIES.find((e) => e.route === route);

  return entry?.label ?? route;
}

/**
 * Production routes that get prerendered to static HTML and listed in the
 * sitemap. Excludes the internal `stress-test` page (in the menu, but no SEO
 * value). Exposed to the prerender crawler via `window.__WICK_ROUTES__`
 * (see docs/main.tsx).
 */
export const PRERENDER_ROUTES: Route[] = ALL_ENTRIES.filter((e) => e.route !== 'stress-test').map((e) => e.route);

/**
 * Section heading for a given route — used by the breadcrumb on subcomponent
 * and chart pages. Walks one level into `subsections` so a route under
 * `API → Hooks` still resolves to `'API'` (the breadcrumb's outermost label).
 * Returns `null` for top-level routes (Overview).
 */
export function getSection(view: Route): string | null {
  const route = menuRoute(view);

  for (const section of BASE_SECTIONS) {
    if (section.items?.some((i) => i.route === route)) return section.heading;
    if (section.subsections?.some((sub) => sub.items?.some((i) => i.route === route))) {
      return section.heading;
    }
  }

  return null;
}

/**
 * Returns every heading on the path from root to the leaf containing `route`.
 * Used by the sidebar to auto-expand nested groups on deep-link / nav.
 *
 * For `route = 'hooks/use-chart-instance'` returns `['API', 'Hooks']`; for a
 * top-level route under `Charts` returns `['Charts']`.
 */
export function getSectionPath(view: Route): string[] {
  const route = menuRoute(view);

  for (const section of BASE_SECTIONS) {
    if (section.items?.some((i) => i.route === route)) {
      return section.heading ? [section.heading] : [];
    }
    if (section.subsections) {
      for (const sub of section.subsections) {
        if (sub.items?.some((i) => i.route === route)) {
          const path: string[] = [];
          if (section.heading) path.push(section.heading);
          if (sub.heading) path.push(sub.heading);

          return path;
        }
      }
    }
  }

  return [];
}

/** Charts API → Charts demo route mapping (used for the "↗ See demos" cross-link). */
export const CHART_API_TO_DEMO: Record<string, Route> = {
  'api/line-series': 'charts/line',
  'api/band-series': 'charts/band',
  'api/bar-series': 'charts/bar',
  'api/candlestick-series': 'charts/candlestick',
  'api/pie-series': 'charts/pie',
  'api/heatmap-series': 'charts/heatmap',
  'api/depth-series': 'charts/depth',
  'api/sparkline': 'charts/sparkline',
};

/** Charts demo → its series API page, the reverse of {@link CHART_API_TO_DEMO}. */
export const CHART_DEMO_TO_API: Partial<Record<Route, Route>> = {};

for (const [api, demo] of Object.entries(CHART_API_TO_DEMO)) {
  if (isRoute(api)) CHART_DEMO_TO_API[demo] = api;
}

/** Guides linked from each chart page's header, most relevant first. */
export const CHART_GUIDES: Partial<Record<Route, Route[]>> = {
  'charts/line': [
    'use-cases/realtime-data',
    'use-cases/x-axis-types',
    'use-cases/secondary-scale',
    'use-cases/custom-intro',
  ],
  'charts/band': ['use-cases/secondary-scale', 'use-cases/realtime-data'],
  'charts/bar': ['use-cases/category-bars', 'use-cases/realtime-data', 'use-cases/custom-intro'],
  'charts/heatmap': ['use-cases/realtime-data'],
  'charts/candlestick': [
    'use-cases/realtime-data',
    'use-cases/annotations',
    'use-cases/data-loading',
    'use-cases/custom-renders',
  ],
  'charts/depth': ['use-cases/realtime-data'],
};

/** The guides before and after `route` in sidebar order, for the Previous / Next links. */
export function adjacentGuides(route: Route): { prev: RouteEntry | null; next: RouteEntry | null } {
  const at = GUIDES.findIndex((guide) => guide.route === route);
  if (at === -1) return { prev: null, next: null };

  return { prev: GUIDES[at - 1] ?? null, next: GUIDES[at + 1] ?? null };
}

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
