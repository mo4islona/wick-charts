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
  'Realtime, animated charts for React, Vue and Svelte. Candlestick, line, bar, heatmap, pie and more ' +
  'stream at 60fps on a canvas engine, with zoom, pan, crosshair and tooltips. ' +
  'Built-in and custom themes, tree-shakeable, zero runtime dependencies.';

export interface RouteMeta {
  title: string;
  description: string;
}

// Hand-written copy for the home + guide + chart pages — the ones most worth
// ranking. API and hook pages are templated below from their sidebar label.
const CURATED: Partial<Record<Route, RouteMeta>> = {
  overview: {
    title: 'Wick Charts — Realtime charts for React, Vue and Svelte',
    description: DEFAULT_DESCRIPTION,
  },
  migration: {
    title: 'Migration Guide — Wick Charts',
    description:
      'Upgrade to Wick Charts: breaking changes, renamed props and step-by-step notes for moving from earlier versions or other charting libraries.',
  },
  'integrations/shadcn': {
    title: 'shadcn/ui Charts — Wick Charts',
    description:
      'Add Wick Charts to a shadcn/ui project with the shadcn CLI: a theme hook that reads your CSS variables, a WickChart wrapper and ready-made chart blocks.',
  },
  'integrations/shadcn/vue': {
    title: 'shadcn-vue Charts — Wick Charts',
    description:
      'Add Wick Charts to a shadcn-vue or Nuxt project with the shadcn-vue CLI: a theme composable that reads your CSS variables, a WickChart wrapper and ready-made chart blocks.',
  },
  'integrations/shadcn/svelte': {
    title: 'shadcn-svelte Charts — Wick Charts',
    description:
      'Add Wick Charts to a shadcn-svelte project with the shadcn-svelte CLI: a theme hook that reads your CSS variables, a WickChart wrapper and ready-made chart blocks.',
  },
  'integrations/nuxt': {
    title: 'Nuxt Charts — Wick Charts',
    description:
      'Add realtime canvas charts to Nuxt with the @wick-charts/nuxt module: auto-imported components and composables, server rendering with no layout shift.',
  },
  'use-cases/theme': {
    title: 'Theming & Custom Themes — Wick Charts',
    description:
      'Customize colors, typography, grid and axes with built-in themes or your own. Live theme editor for Wick Charts in React, Vue and Svelte.',
  },
  'charts/candlestick': {
    title: 'Candlestick Charts for React, Vue & Svelte — Wick Charts',
    description:
      'Canvas-rendered OHLC candlestick charts with real-time streaming, zoom, pan, crosshair and tooltips. 60fps, tree-shakeable, zero runtime dependencies.',
  },
  'charts/line': {
    title: 'Line & Area Charts for React, Vue & Svelte — Wick Charts',
    description:
      'Animated line and area charts with live streaming, gradient fills, multiple series, crosshair and tooltips. Canvas-rendered at 60fps.',
  },
  'charts/band': {
    title: 'Band & Range Charts for React, Vue & Svelte — Wick Charts',
    description:
      'Canvas band charts that fill between a low and a high edge: Bollinger bands, confidence intervals and fan charts, with live streaming and tooltips.',
  },
  'charts/depth': {
    title: 'Order Book Charts for React, Vue & Svelte — Wick Charts',
    description:
      'Live order book charts: cumulative bid and ask walls around the mid price, with smooth morphing updates, mid and spread marker, zoom around mid and tooltips.',
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
  'charts/heatmap': {
    title: 'Heatmap Charts for React, Vue & Svelte — Wick Charts',
    description:
      'Canvas heatmaps of category cells colored by value on a perceptual sequential or diverging scale, with an animated entrance, smooth in-place updates, hover and tooltips.',
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
  'use-cases/x-axis-types': {
    title: 'Numeric X Axis — Wick Charts',
    description:
      'Plot and stream line, bar and band series over plain numbers instead of time — a load-test curve over concurrency levels and a live elevation profile over distance. React, Vue and Svelte.',
  },
  'use-cases/category-bars': {
    title: 'Category Bar Charts — Wick Charts',
    description:
      'Bar charts over named categories: a category X axis with band padding, grouped, stacked and 100% bars, value labels, a fixed category order, negative values and fades for categories that come and go. React, Vue and Svelte.',
  },
  'use-cases/annotations': {
    title: 'Chart Annotations: Markers, Regions & Reference Lines — Wick Charts',
    description:
      'Pin events with markers, shade a time window with a region and draw thresholds with reference lines — annotations that stay out of the tooltip, legend and Y range. React, Vue and Svelte.',
  },
  'use-cases/data-loading': {
    title: 'Load History on Scroll — Wick Charts',
    description:
      'Fetch older data when the reader pans or zooms near the edge of the series with EdgeLoader, show a pluggable loading indicator at the boundary and animate the new bars in.',
  },
  'use-cases/custom-intro': {
    title: 'Custom Intro Animations — Wick Charts',
    description:
      'Write your own series intro: a small function that reads the frame and returns clip, head and value directives while the engine keeps scales, data and drawing. Works for line, bar and candlestick series.',
  },
  'use-cases/secondary-scale': {
    title: 'Secondary Y Scale — Wick Charts',
    description:
      'Overlay two unrelated measures on one pane — price and RSI, rate and error rate — each on its own named Y scale with its own autoscale and axis, sharing the time axis. React, Vue and Svelte.',
  },
};

// One-line summaries of what each component / hook actually does — shared by
// the per-page meta description and llms.txt so neither degrades into
// repeated boilerplate. Titles stay templated from the sidebar label.
const API_SUMMARIES: Partial<Record<Route, string>> = {
  'api/band-series':
    'Band (range) series that fills between a low and a high edge — percentile bands, min/max envelopes, Bollinger bands and fan charts.',
  'api/bar-series':
    'Bar and histogram series with multi-layer data, stacking, per-layer colors, rounded corners and entry animations.',
  'api/candlestick-series':
    'OHLC candlestick series with volume bars, body width and corner radius options, entry animations and custom painters.',
  'api/line-series':
    'Line and area series with multiple layers, stacking, curve interpolation, gradient fills and a live pulse effect.',
  'api/pie-series': 'Pie and donut series with inner radius control, hover animation and animated slice updates.',
  'api/heatmap-series':
    'Matrix heatmap series — category cells colored by value on a perceptual ramp from the theme, with an entrance wave, in-place morphing and hover lift.',
  'api/depth-series':
    'Order book series on a numeric price axis — cumulative bid and ask walls, a mid and spread marker, morphing updates and level deltas via updateData.',
  'api/sparkline':
    'Self-contained inline mini chart with an optional value label — renders without a ChartContainer (React only).',
  'api/chart-container':
    'Root chart component — theme, axes, padding, viewport, grid, gradient, animations and interactivity for the series inside.',
  'api/crosshair': 'Cursor-tracking crosshair that pins axis labels to the hovered time and value.',
  'api/edge-loader':
    'Triggers a history fetch when the visible range nears the data edge, with a pluggable loading indicator at the boundary (React only).',
  'api/heatmap-tooltip':
    'Hover tooltip for heatmap cells — row and column label, value and an intensity meter on the color ramp.',
  'api/marker':
    'Point annotation pinned to a time and value, with shapes, labels and an optional pulse — outside the series model.',
  'api/reference-line':
    'Straight reference line across the plot — a horizontal threshold pinned to a value or a vertical boundary pinned to a time.',
  'api/time-region':
    'Translucent vertical band that shades a time interval, such as an incident or maintenance window, behind the series.',
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
  'api/x-axis': 'Horizontal axis for time, numeric or category X with automatic tick density and label formatting.',
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
