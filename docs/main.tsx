import { createRoot } from 'react-dom/client';

import App from './App';
import { migrateLegacyHash } from './router';
import { PRERENDER_ROUTES } from './routes';
import { SITE_URL } from './seo';

// Redirect legacy `#charts/line`-style links to their new path form before the
// app reads the location.
migrateLegacyHash();

// Surface the prerender route list + canonical origin so the SSG crawler
// (scripts/prerender.mjs) can discover every page from the booted app — keeps
// routes.ts/seo.ts the single source of truth.
window.__WICK_ROUTES__ = PRERENDER_ROUTES;
window.__WICK_SITE_URL__ = SITE_URL;

// StrictMode is intentionally off. Its dev-only mount→unmount→remount re-seeds
// streaming charts (a second `setSeriesData` of the same seed), which collapses
// the `viewport.initialRange` warm-up window via the bulk-replace fitToData path
// in core. The same fragility affects real re-seeds in core (tracked for the
// viewport-engine refactor); this just keeps the docs/playground demos honest.
const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

const root = createRoot(container);
root.render(<App />);
