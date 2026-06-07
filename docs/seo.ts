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

function templatedMeta(route: Route): RouteMeta {
  const label = labelForRoute(route);

  if (route.startsWith('api/')) {
    return {
      title: `${label} API reference — Wick Charts`,
      description: `Props, types, defaults and live examples for the ${label} component in Wick Charts — canvas charts for React, Vue and Svelte.`,
    };
  }

  if (route.startsWith('hooks/')) {
    return {
      title: `${label} hook — Wick Charts`,
      description: `Signature, return value and usage for the ${label} hook in Wick Charts — high-performance canvas charts for React, Vue and Svelte.`,
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
