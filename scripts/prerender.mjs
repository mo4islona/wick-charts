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

import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
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

// One Chromium tab → fully-rendered HTML for a route. Aborts the npm-registry
// version probe (slow, irrelevant) so the page reaches network-idle quickly.
// Dark color scheme is emulated so every frozen page matches the dark default
// theme — the pre-paint guard in index.html handles light-preference visitors.
async function snapshot(browser, route) {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
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
  await page.close();

  return `<!DOCTYPE html>\n${body}\n`;
}

async function readAppGlobals(browser) {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
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

// og.png — the social card behind every page's og:image / twitter:image.
// Scrapers reject SVG, so a real PNG is required; screenshotting the live
// overview hero (dark theme, charts streaming) keeps it zero-maintenance.
async function captureOgImage(browser) {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  // Exactly the 1200×630 the og:image:width/height meta declares.
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.url().includes('registry.npmjs.org')) return req.abort();

    return req.continue();
  });

  await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-prerender-route') === 'overview', {
    timeout: 30000,
  });
  // Drop the sidebar (the Sidebar root is the page's only <aside>) so the
  // card is hero + charts only; the charts re-layout to the freed width.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('aside')) {
      el.remove();
    }
  });
  // Let the charts re-layout and stream a few frames so the card shows real
  // candles at the full card width.
  await delay(1500);

  await page.screenshot({ path: join(DIST, 'og.png'), type: 'png' });
  await page.close();
}

function buildSitemap(routes, siteUrl) {
  const urls = routes.map((r) => `  <url>\n    <loc>${siteUrl}${routePath(r)}</loc>\n  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

// llms-full.txt — the full-content companion to llms.txt. Not a site scrape:
// it concatenates the curated LLM-oriented docs (the wick-charts skill,
// checked into .agents/skills/ — .claude/skills is a symlink to it) with the
// runnable use-case example sources the docs pages render, so an LLM gets
// API knowledge + working code.
const SKILL_DIR = resolve(here, '..', '.agents', 'skills', 'wick-charts');
const EXAMPLES_DIR = resolve(here, '..', 'docs', 'pages', 'use-cases');
const SKILL_FILES = ['SKILL.md', 'candlestick.md', 'line.md', 'bar.md', 'pie.md', 'sparkline.md', 'context.md'];

const stripFrontmatter = (md) => md.replace(/^---\n[\s\S]*?\n---\n/, '');

const exampleTitle = (slug) =>
  slug
    .split('-')
    .map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');

async function buildLlmsFull(siteUrl) {
  const sections = [];
  for (const name of SKILL_FILES) {
    const md = await readFile(join(SKILL_DIR, name), 'utf8');
    sections.push(stripFrontmatter(md).trim());
  }

  const exampleFiles = (await readdir(EXAMPLES_DIR)).filter((f) => f.endsWith('.example.tsx')).sort();
  for (const file of exampleFiles) {
    const slug = file.replace('.example.tsx', '');
    const src = await readFile(join(EXAMPLES_DIR, file), 'utf8');
    sections.push(
      [
        `# Use case: ${exampleTitle(slug)} (React)`,
        '',
        `Live demo: ${siteUrl}/use-cases/${slug}`,
        '',
        '```tsx',
        src.trim(),
        '```',
      ].join('\n'),
    );
  }

  const intro = [
    '# Wick Charts — full documentation for LLMs',
    '',
    `> Canvas-rendered candlestick, line, bar, pie and sparkline charts for React, Vue and Svelte. Page index: ${siteUrl}/llms.txt`,
  ].join('\n');

  return `${[intro, ...sections].join('\n\n---\n\n')}\n`;
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

    for (const route of ordered) {
      const html = await snapshot(browser, route);
      const outDir = route === 'overview' ? DIST : join(DIST, route);
      await mkdir(outDir, { recursive: true });
      await writeFile(join(outDir, 'index.html'), html, 'utf8');
      console.log(`  ✓ ${routePath(route)}`);
    }

    await captureOgImage(browser);

    await writeFile(join(DIST, 'sitemap.xml'), buildSitemap(routes, siteUrl), 'utf8');
    await writeFile(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`, 'utf8');
    await writeFile(join(DIST, 'llms.txt'), llmsTxt, 'utf8');
    await writeFile(join(DIST, 'llms-full.txt'), await buildLlmsFull(siteUrl), 'utf8');

    // SPA-style fallback: unknown paths boot the prerendered shell, which the
    // client router resolves (Cloudflare serves it with a 404 status).
    await copyFile(join(DIST, 'index.html'), join(DIST, '404.html'));

    console.log('Wrote sitemap.xml, robots.txt, llms.txt, llms-full.txt, og.png, 404.html');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
