// Imperative <head> sync. React 18 has no built-in document head API, and the
// docs don't pull in a helmet-style library, so we upsert the handful of tags
// that matter for SEO and social cards directly. Driven by the route via
// `applyRouteMeta`; the prerender crawler snapshots whatever this leaves behind.

import type { Route } from './routes';
import { SITE_NAME, SITE_URL, metaForRoute } from './seo';

function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }

  el.setAttribute('content', content);
}

function upsertCanonical(href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }

  el.setAttribute('href', href);
}

/** Sync <title>, meta description, canonical and OG/Twitter tags to `route`. */
export function applyRouteMeta(route: Route): void {
  if (typeof document === 'undefined') return;

  const { title, description, canonical } = metaForRoute(route);
  // PNG screenshot baked by the prerender script (scripts/prerender.mjs) —
  // social scrapers reject SVG images, so the favicon can't be the card.
  const image = `${SITE_URL}/og.png`;

  document.title = title;
  upsertMeta('name', 'description', description);
  upsertCanonical(canonical);

  upsertMeta('property', 'og:type', 'website');
  upsertMeta('property', 'og:site_name', SITE_NAME);
  upsertMeta('property', 'og:title', title);
  upsertMeta('property', 'og:description', description);
  upsertMeta('property', 'og:url', canonical);
  upsertMeta('property', 'og:image', image);
  upsertMeta('property', 'og:image:width', '1200');
  upsertMeta('property', 'og:image:height', '630');
  upsertMeta('property', 'og:image:type', 'image/png');

  upsertMeta('name', 'twitter:card', 'summary_large_image');
  upsertMeta('name', 'twitter:title', title);
  upsertMeta('name', 'twitter:description', description);
  upsertMeta('name', 'twitter:image', image);
}
