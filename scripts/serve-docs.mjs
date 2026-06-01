// Serve the prerendered docs-dist locally with SPA fallback — a quick way to
// eyeball the production SEO build (`pnpm build:seo`) the way Cloudflare will,
// including the per-route static HTML. `pnpm vite preview` targets the lib
// build dir, not docs-dist, so this serves the right output.

import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sirv from 'sirv';

const here = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(here, '..', 'docs-dist');
const PORT = Number(process.env.PORT ?? 4173);

const serve = sirv(DIST, { dev: false, single: true, etag: true });
const server = createServer((req, res) => {
  serve(req, res, () => {
    res.statusCode = 404;
    res.end('Not found');
  });
});

server.listen(PORT, () => {
  console.log(`docs-dist served at http://localhost:${PORT}`);
});
