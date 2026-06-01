// History-API router. Each Route maps to a real pathname so every page has
// its own crawlable URL (e.g. `/charts/candlestick`) and can be prerendered to
// static HTML. Replaces the old hash router — see `migrateLegacyHash` for the
// backwards-compatible redirect from `#charts/candlestick`-style links.

import { useCallback, useEffect, useState } from 'react';

import { ROUTE_ALIASES, type Route, isRoute } from './routes';

/** Route → URL pathname. Overview is the site root (`/`). */
export function routeToPath(route: Route): string {
  return route === 'overview' ? '/' : `/${route}`;
}

function normalize(pathname: string): string {
  return pathname.replace(/^\/+/, '').replace(/\/+$/, '');
}

/** Pathname → Route, applying legacy aliases. Unknown paths fall back to overview. */
export function pathToRoute(pathname: string): Route {
  const stripped = normalize(pathname);
  if (stripped === '') return 'overview';

  const aliased = ROUTE_ALIASES[stripped];
  if (aliased) return aliased;

  if (isRoute(stripped)) return stripped;

  return 'overview';
}

/**
 * Resolve an internal `href` to a known Route, or `null` when it isn't one of
 * ours (external link, unknown path, asset). Used by the App-level click
 * interceptor so only real in-app links are turned into SPA navigations —
 * everything else keeps the browser's default behaviour.
 */
export function resolveInternalPath(href: string): Route | null {
  if (!href.startsWith('/')) return null;

  const path = href.split('#')[0].split('?')[0];
  const stripped = normalize(path);
  if (stripped === '') return 'overview';

  const aliased = ROUTE_ALIASES[stripped];
  if (aliased) return aliased;

  if (isRoute(stripped)) return stripped;

  return null;
}

/**
 * One-time redirect for old hash URLs (`#charts/line`, `#dashboard`, …) shared
 * before the move to path routing. Rewrites the location to the path form
 * without a reload so bookmarks and inbound links keep resolving.
 */
export function migrateLegacyHash(): void {
  if (typeof window === 'undefined') return;

  const raw = window.location.hash.replace(/^#\/?/, '');
  if (!raw) return;

  const key = raw.split('?')[0];
  const target = ROUTE_ALIASES[key] ?? (isRoute(key) ? (key as Route) : null);
  if (!target) return;

  window.history.replaceState({}, '', routeToPath(target) + window.location.search);
}

/** Current route + a `navigate` that pushes a new history entry. */
export function usePathRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() =>
    typeof window === 'undefined' ? 'overview' : pathToRoute(window.location.pathname),
  );

  useEffect(() => {
    const onPop = () => setRoute(pathToRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);

    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((r: Route) => {
    const path = routeToPath(r);
    if (path !== window.location.pathname) {
      window.history.pushState({}, '', path);
    }

    setRoute(r);
  }, []);

  return [route, navigate];
}
