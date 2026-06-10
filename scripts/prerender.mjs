// Static-site generation for the docs SPA.
//
// `vite build --mode docs` emits a client-rendered shell (empty <div id=root>),
// which is invisible to crawlers and social scrapers. This script boots the
// built app in headless Chromium, walks every production route, and freezes the
// fully-rendered DOM (real content + the per-route <head> that App applies) into
// a static `index.html` per route. It then writes sitemap.xml, robots.txt,
// llms.txt and a 404 fallback.
//
// The route list and canonical origin come from the booted app
// (window.__WICK_ROUTES__ / __WICK_SITE_URL__, set in docs/main.tsx), so
// routes.ts / seo.ts stay the single source of truth — no duplicated list here.

import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer';
import sirv from 'sirv';

const here = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(here, '..', 'docs-dist');
const PORT = 4317;
const ORIGIN = `http://localhost:${PORT}`;

const routePath = (route) => (route === 'overview' ? '/' : `/${route}`);
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// Serve the build with SPA fallback so any not-yet-written route still loads the
// shell; the client router re-renders from window.location.pathname.
function startServer() {
  const serve = sirv(DIST, { dev: false, single: true, etag: true });
  const server = createServer((req, res) => {
    serve(req, res, () => {
      res.statusCode = 404;
      res.end('Not found');
    });
  });

  return new Promise((res) => server.listen(PORT, () => res(server)));
}

// One Chromium tab → fully-rendered HTML for a route, plus the page's <main>
// text + head metadata for llms-full.txt. Aborts the npm-registry version
// probe (slow, irrelevant) so the page reaches network-idle quickly.
async function snapshot(browser, route) {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.url().includes('registry.npmjs.org')) return req.abort();

    return req.continue();
  });

  await page.goto(ORIGIN + routePath(route), { waitUntil: 'networkidle0', timeout: 60000 });
  // Wait for the client to (re-)render this exact route — not just any route —
  // so a reused SPA-fallback shell can't be snapshotted as a stale page.
  // waitForFunction polls per animation frame, so it reliably catches the
  // attribute *value* change (waitForSelector can miss an attribute mutation on
  // <html> that lands after the last childList mutation).
  await page.waitForFunction(
    (expected) => document.documentElement.getAttribute('data-prerender-route') === expected,
    { timeout: 30000 },
    route,
  );
  await delay(200);

  const body = await page.evaluate(() => document.documentElement.outerHTML);
  const meta = await page.evaluate(() => ({
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
    text: document.querySelector('main')?.innerText ?? '',
  }));
  await page.close();

  return { html: `<!DOCTYPE html>\n${body}\n`, ...meta };
}

async function readAppGlobals(browser) {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.url().includes('registry.npmjs.org')) return req.abort();

    return req.continue();
  });

  await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-prerender-route') !== null, {
    timeout: 30000,
  });

  const routes = await page.evaluate(() => window.__WICK_ROUTES__ ?? []);
  const siteUrl = await page.evaluate(() => window.__WICK_SITE_URL__ ?? '');
  const llmsTxt = await page.evaluate(() => window.__WICK_LLMS_TXT__ ?? '');
  await page.close();

  return { routes, siteUrl, llmsTxt };
}

function buildSitemap(routes, siteUrl) {
  const urls = routes.map((r) => `  <url>\n    <loc>${siteUrl}${routePath(r)}</loc>\n  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

// llms-full.txt — the full-content companion to llms.txt: every page's
// rendered text concatenated in route order, one section per page.
function buildLlmsFull(routes, siteUrl, snapshots) {
  const sections = routes.map((route) => {
    const snap = snapshots.get(route);
    const header = [`# ${snap.title}`, '', `URL: ${siteUrl}${routePath(route)}`];
    if (snap.description) header.push(`Description: ${snap.description}`);

    return [...header, '', snap.text.trim()].join('\n');
  });

  return `${sections.join('\n\n---\n\n')}\n`;
}

async function main() {
  const server = await startServer();
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 900 },
  });

  try {
    const { routes, siteUrl, llmsTxt } = await readAppGlobals(browser);
    if (routes.length === 0) throw new Error('window.__WICK_ROUTES__ was empty — is docs/main.tsx exposing it?');
    if (llmsTxt.length === 0) throw new Error('window.__WICK_LLMS_TXT__ was empty — is docs/main.tsx exposing it?');

    console.log(`Prerendering ${routes.length} routes from ${siteUrl}`);

    // Overview last: it writes docs-dist/index.html, which doubles as the
    // SPA-fallback shell. Keeping it pristine until the end means every other
    // route is crawled against a clean shell.
    const ordered = [...routes.filter((r) => r !== 'overview'), ...routes.filter((r) => r === 'overview')];

    const snapshots = new Map();
    for (const route of ordered) {
      const snap = await snapshot(browser, route);
      snapshots.set(route, snap);
      const outDir = route === 'overview' ? DIST : join(DIST, route);
      await mkdir(outDir, { recursive: true });
      await writeFile(join(outDir, 'index.html'), snap.html, 'utf8');
      console.log(`  ✓ ${routePath(route)}`);
    }

    await writeFile(join(DIST, 'sitemap.xml'), buildSitemap(routes, siteUrl), 'utf8');
    await writeFile(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`, 'utf8');
    await writeFile(join(DIST, 'llms.txt'), llmsTxt, 'utf8');
    // Emit in `routes` order (overview first), not crawl order (overview last).
    await writeFile(join(DIST, 'llms-full.txt'), buildLlmsFull(routes, siteUrl, snapshots), 'utf8');

    // SPA-style fallback: unknown paths boot the prerendered shell, which the
    // client router resolves (Cloudflare serves it with a 404 status).
    await copyFile(join(DIST, 'index.html'), join(DIST, '404.html'));

    console.log('Wrote sitemap.xml, robots.txt, llms.txt, llms-full.txt, 404.html');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
