// Single source of truth for per-route SEO metadata. Consumed at runtime by
// the App `<head>` effect (so the browser tab + social scrapers see the right
// title/description while navigating) and captured verbatim by the prerender
// crawler, which freezes each route's resolved `<head>` into static HTML.

import { routeToPath } from './router';
import { type Route, labelForRoute } from './routes';

/** Canonical origin. Must match the Cloudflare Pages custom domain. */
export const SITE_URL = 'https://wick-charts.eeff.io';
export const SITE_NAME = 'Wick Charts';

/** Used on the home page and as the fallback when a route has no entry. */
export const DEFAULT_DESCRIPTION =
  'Canvas-rendered candlestick, line, bar, pie and sparkline charts for React, Vue and Svelte. ' +
  'Real-time streaming at 60fps, 22 built-in themes, zoom, pan, crosshair and tooltips. ' +
  'Tree-shakeable with zero runtime dependencies.';

export interface RouteMeta {
  title: string;
  description: string;
}

// Hand-written copy for the home + guide + chart pages — the ones most worth
// ranking. API and hook pages are templated below from their sidebar label.
const CURATED: Partial<Record<Route, RouteMeta>> = {
  overview: {
    title: 'Wick Charts — High-performance timeseries charts for React, Vue, Svelte',
    description: DEFAULT_DESCRIPTION,
  },
  migration: {
    title: 'Migration Guide — Wick Charts',
    description:
      'Upgrade to Wick Charts: breaking changes, renamed props and step-by-step notes for moving from earlier versions or other charting libraries.',
  },
  'use-cases/theme': {
    title: 'Theming & Custom Themes — Wick Charts',
    description:
      'Customize colors, typography, grid and axes with 22 built-in themes or your own. Live theme editor for Wick Charts in React, Vue and Svelte.',
  },
  'charts/candlestick': {
    title: 'Candlestick Charts for React, Vue & Svelte — Wick Charts',
    description:
      'Canvas-rendered OHLC candlestick charts with real-time streaming, zoom, pan, crosshair and tooltips. 60fps, tree-shakeable, zero runtime dependencies.',
  },
  'charts/line': {
    title: 'Line & Area Charts for React, Vue & Svelte — Wick Charts',
    description:
      'High-performance line and area charts with live streaming, gradient fills, multiple series, crosshair and tooltips. Canvas-rendered at 60fps.',
  },
  'charts/bar': {
    title: 'Bar Charts for React, Vue & Svelte — Wick Charts',
    description:
      'Canvas bar and column charts with real-time updates, custom colors and tooltips. Lightweight, tree-shakeable and dependency-free.',
  },
  'charts/pie': {
    title: 'Pie & Donut Charts for React, Vue & Svelte — Wick Charts',
    description:
      'Animated pie and donut charts with legends, tooltips and custom themes. Canvas-rendered, smooth and dependency-free.',
  },
  'charts/sparkline': {
    title: 'Sparkline Charts for React, Vue & Svelte — Wick Charts',
    description:
      'Tiny inline sparkline charts for dashboards and tables. Streaming-ready, canvas-rendered, with near-zero overhead.',
  },
  'use-cases/realtime-data': {
    title: 'Realtime Data Streaming — Wick Charts',
    description:
      'Stream live data into Wick Charts two ways: declaratively via the series data prop, or imperatively with appendData / updateData / keepLast. 60fps canvas updates in React, Vue and Svelte.',
  },
  'use-cases/multi-chart-sync': {
    title: 'Multi-chart Sync — Wick Charts',
    description:
      'Synchronize crosshair, zoom and pan across multiple charts to build linked trading dashboards with Wick Charts in React, Vue or Svelte.',
  },
  'use-cases/custom-renders': {
    title: 'Custom Renders — Wick Charts',
    description:
      'Render chart types the library doesn’t ship by combining a data transform with a custom painter. A worked Renko example built on the candlePainter escape hatch in Wick Charts.',
  },
};

// One-line summaries of what each component / hook actually does — shared by
// the per-page meta description and llms.txt so neither degrades into
// repeated boilerplate. Titles stay templated from the sidebar label.
const API_SUMMARIES: Partial<Record<Route, string>> = {
  'api/bar-series':
    'Bar and histogram series with multi-layer data, stacking, per-layer colors, rounded corners and entry animations.',
  'api/candlestick-series':
    'OHLC candlestick series with volume bars, body width and corner radius options, entry animations and custom painters.',
  'api/line-series':
    'Line and area series with multiple layers, stacking, curve interpolation, gradient fills and a live pulse effect.',
  'api/pie-series': 'Pie and donut series with inner radius control, hover animation and animated slice updates.',
  'api/sparkline':
    'Self-contained inline mini chart with an optional value label — renders without a ChartContainer (React only).',
  'api/chart-container':
    'Root chart component — theme, axes, padding, viewport, grid, gradient, animations and interactivity for the series inside.',
  'api/crosshair': 'Cursor-tracking crosshair that pins axis labels to the hovered time and value.',
  'api/info-bar':
    'Top info bar showing OHLC or values for the hovered (or last) bar across every visible series, with sorting and number formatting.',
  'api/legend':
    'Series legend below or beside the chart with toggle / isolate visibility modes and a custom render slot.',
  'api/navigator': 'Overview mini-chart with a draggable window for panning and zooming the visible range.',
  'api/number-flow': 'Standalone animated number that rolls digits on change, with format and spin-duration props.',
  'api/pie-legend':
    'Slice list for pie charts showing value or percent per slice, with formatting and a custom render slot.',
  'api/pie-tooltip': 'Hover tooltip for pie slices with formatting and a custom render slot.',
  'api/title': 'Chart title bar with optional subtitle, hoisted above the canvas.',
  'api/tooltip':
    'Floating tooltip near the cursor with per-series value snapshots, sorting, formatting and a custom render slot.',
  'api/x-axis': 'Horizontal time axis with automatic tick density and label formatting.',
  'api/y-axis': 'Vertical value axis with auto, fixed, percent-padded or computed bounds and tick formatting.',
  'api/y-label': 'Floating last-price badge with a dashed line pinned to the Y axis, tracking live updates per series.',
  'hooks/use-chart-instance':
    'Access the underlying chart instance for imperative calls like appendData, updateData and setVisibleRange.',
  'hooks/use-theme': 'Read the resolved chart theme from context inside custom overlays and slots.',
  'hooks/use-crosshair-position':
    'Reactive crosshair position — media coordinates, time and value under the cursor, or null when inactive.',
  'hooks/use-last-y-value':
    'Live last Y value of a series, with an isLive flag — drives badges and streaming readouts.',
  'hooks/use-previous-close': 'Previous bar close value of a series, for change and delta readouts.',
  'hooks/use-visible-range': 'Reactive visible X range of the viewport as { from, to }.',
  'hooks/use-y-range': 'Reactive Y bounds of the viewport as { min, max }.',
};

function templatedMeta(route: Route): RouteMeta {
  const label = labelForRoute(route);
  const summary = API_SUMMARIES[route];

  if (route.startsWith('api/')) {
    return {
      title: `${label} API reference — Wick Charts`,
      description: summary ?? `Props, types, defaults and live examples for the ${label} component in Wick Charts.`,
    };
  }

  if (route.startsWith('hooks/')) {
    return {
      title: `${label} hook — Wick Charts`,
      description: summary ?? `Signature, return value and usage for the ${label} hook in Wick Charts.`,
    };
  }

  return {
    title: `${label} — Wick Charts`,
    description: DEFAULT_DESCRIPTION,
  };
}

export interface ResolvedMeta extends RouteMeta {
  canonical: string;
}

/** Title, description and canonical URL for a route. */
export function metaForRoute(route: Route): ResolvedMeta {
  const meta = CURATED[route] ?? templatedMeta(route);

  return {
    ...meta,
    canonical: `${SITE_URL}${routeToPath(route)}`,
  };
}
