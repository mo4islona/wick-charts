#!/usr/bin/env node
// Cross-framework (and cross-session) visual comparison of the dogfood apps. Run from the repo root.
//
//   node .agents/skills/wick-charts-dogfood/scripts/compare.mjs --session 2026-11-20 \
//     [--baseline test/dogfood/sessions/2026-10-17/compare] [--scenarios a,b] [--wait 2500] \
//     [--apps react:5181,vue:5182,svelte:5183] [--state default|hover|zoom]
//
// For each scenario: captures `#scenario` from every running app, writes
// <out>/<id>/<fw>.png, and a montage <out>/<id>.png with three rows:
//   1. the captures,  2. diff of each framework vs react,  3. diff vs the baseline session (if given).
// Scenario ids come from the session PLAN.md table unless --scenarios is passed.
// --state hover / zoom captures after a pointer hover or one wheel step (output: compare-<state>/):
// interaction states catch wrapper bugs that the default render hides.
// The Bash sandbox blocks Chrome's sockets, so every request is proxied through Node.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import puppeteer from 'puppeteer';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const NOISE = [/\[vite\]/, /WebSocket/, /websocket/, /Download the React DevTools/, /favicon\.ico/];
const DIFF_THRESHOLD = 40;

const { values: args } = parseArgs({
  options: {
    session: { type: 'string' },
    plan: { type: 'string' },
    out: { type: 'string' },
    baseline: { type: 'string' },
    scenarios: { type: 'string' },
    wait: { type: 'string', default: '2500' },
    apps: { type: 'string', default: 'react:5181,vue:5182,svelte:5183' },
    state: { type: 'string', default: 'default' },
  },
});

const sessionDir = args.session ? resolve('test/dogfood/sessions', args.session) : null;
const planPath = args.plan ?? (sessionDir ? join(sessionDir, 'PLAN.md') : null);
const compareDir = args.state === 'default' ? 'compare' : `compare-${args.state}`;
const outDir = resolve(args.out ?? (sessionDir ? join(sessionDir, compareDir) : join('test/dogfood', compareDir)));
const apps = args.apps.split(',').map((pair) => {
  const [fw, port] = pair.split(':');

  return { fw, port: Number(port) };
});
const scenarios = args.scenarios ? args.scenarios.split(',') : scenariosFromPlan(planPath);

mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--force-device-scale-factor=1', '--hide-scrollbars'],
  defaultViewport: { width: 1400, height: 1200, deviceScaleFactor: 1 },
});

const summary = [];

try {
  for (const id of scenarios) {
    const captures = [];

    for (const app of apps) {
      captures.push(await captureScenario(app, id));
    }

    const montage = await buildMontage(id, captures);
    summary.push({ id, ...montage, apps: captures.map(({ png, ...rest }) => rest) });
    console.error(`${id}: ${JSON.stringify(montage.diffs)}`);
  }
} finally {
  await browser.close();
}

writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(`wrote ${summary.length} montages + summary.json to ${outDir}`);

// Under load the proxied dev server drops requests at random (net::ERR_FAILED); a retry is
// cheaper than a false "not captured" in the montage.
async function captureScenario(app, id) {
  let result = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    result = await captureOnce(app, id);
    if (result.ok) break;

    await sleep(1000 * attempt);
  }

  return result;
}

async function captureOnce({ fw, port }, id) {
  const page = await browser.newPage();
  const result = { fw, ok: false, console: [], pageErrors: [], png: null };

  await page.setRequestInterception(true);
  page.on('request', (req) => proxy(req));
  page.on('console', (msg) => {
    const text = msg.text();
    if (NOISE.some((re) => re.test(text))) return;

    if (['error', 'warn', 'warning'].includes(msg.type())) {
      result.console.push(`${msg.type()}: ${text}`.slice(0, 400));
    }
  });
  page.on('pageerror', (err) => result.pageErrors.push(String(err).slice(0, 400)));

  try {
    await page.goto(`http://localhost:${port}/?s=${id}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // Apps load data lazily at different speeds; count the settle time from the contract's ready flag,
    // or a slow app gets captured mid-intro and the diff shows animation phase, not a bug.
    await page.waitForFunction('window.__dogfood?.ready === true', { timeout: 15_000 }).catch(() => {});
    await sleep(Number(args.wait));

    const el = await page.waitForSelector('#scenario', { timeout: 5_000 });
    await interact(page, el, args.state);
    const file = join(outDir, id, `${fw}.png`);
    mkdirSync(dirname(file), { recursive: true });
    result.png = await el.screenshot({ path: file });
    result.ok = true;
  } catch (err) {
    result.error = String(err).slice(0, 300);
  } finally {
    await page.close();
  }

  return result;
}

async function interact(page, el, state) {
  if (state === 'default') return;

  const box = await el.boundingBox();
  if (!box) return;

  const x = box.x + box.width * 0.6;
  const y = box.y + box.height * 0.5;
  await page.mouse.move(x, y, { steps: 4 });

  if (state === 'zoom') {
    await page.mouse.wheel({ deltaY: -300 });
    await sleep(1500);
    // Leave the plot so the crosshair and tooltip do not cover the result.
    await page.mouse.move(1, 1);
  }

  await sleep(500);
}

async function buildMontage(id, captures) {
  const images = {};

  for (const c of captures) {
    if (c.png) images[c.fw] = toDataUrl(c.png);
  }

  if (args.baseline) {
    for (const c of captures) {
      const file = join(resolve(args.baseline), id, `${c.fw}.png`);
      if (existsSync(file)) images[`baseline:${c.fw}`] = toDataUrl(readFileSync(file));
    }
  }

  const pairs = [];
  const base = captures[0]?.fw;
  for (const c of captures.slice(1)) {
    pairs.push({ row: 'frameworks', a: base, b: c.fw });
  }
  for (const c of captures) {
    pairs.push({ row: 'baseline', a: `baseline:${c.fw}`, b: c.fw });
  }

  const page = await browser.newPage();
  await page.setContent(montageHtml(id, captures, images));
  const diffs = await page.evaluate((p) => window.__diff(p), pairs);
  const file = join(outDir, `${id}.png`);
  await (await page.$('#montage')).screenshot({ path: file });
  await page.close();

  return { montage: file, diffs };
}

function montageHtml(id, captures, images) {
  const cells = captures
    .map((c) => {
      const issues = c.pageErrors.length + c.console.length;
      const badge = issues > 0 ? ` <b>${issues} console issue(s)</b>` : '';
      const body = images[c.fw]
        ? `<img src="${images[c.fw]}">`
        : `<div class="missing">${c.error ?? 'not captured'}</div>`;

      return `<figure><figcaption>${c.fw}${badge}</figcaption>${body}</figure>`;
    })
    .join('');

  return `<!doctype html><html><head><style>
    body { margin: 0; background: #fff; font: 12px -apple-system, sans-serif; }
    #montage { display: inline-block; padding: 8px; background: #fff; }
    h1 { font-size: 14px; margin: 0 0 6px; }
    .row { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 6px; }
    figure { margin: 0; }
    figcaption { font-weight: 600; margin-bottom: 2px; }
    figcaption b { color: #c00; }
    img, canvas { display: block; width: 480px; border: 1px solid #ccc; }
    .missing { width: 480px; height: 240px; display: grid; place-items: center; background: #fee; color: #900; }
  </style></head><body><div id="montage">
    <h1>${id}</h1>
    <div class="row">${cells}</div>
    <div class="row" id="row-frameworks"></div>
    <div class="row" id="row-baseline"></div>
  </div>
  <script>
    const IMAGES = ${JSON.stringify(images)};
    const THRESHOLD = ${DIFF_THRESHOLD};

    async function load(src) {
      const img = new Image();
      img.src = src;
      await img.decode();

      return img;
    }

    function pixels(img, w, h) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);

      return ctx.getImageData(0, 0, w, h);
    }

    window.__diff = async (pairs) => {
      const out = {};

      for (const { row, a, b } of pairs) {
        if (!IMAGES[a] || !IMAGES[b]) continue;

        const [ia, ib] = await Promise.all([load(IMAGES[a]), load(IMAGES[b])]);
        const w = ia.naturalWidth;
        const h = ia.naturalHeight;
        const pa = pixels(ia, w, h);
        const pb = pixels(ib, w, h);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        const d = ctx.createImageData(w, h);
        let changed = 0;

        for (let p = 0; p < pa.data.length; p += 4) {
          const delta = Math.max(
            Math.abs(pa.data[p] - pb.data[p]),
            Math.abs(pa.data[p + 1] - pb.data[p + 1]),
            Math.abs(pa.data[p + 2] - pb.data[p + 2]),
          );
          const hit = delta > THRESHOLD;
          if (hit) changed++;

          const grey = (pa.data[p] * 0.3 + pa.data[p + 1] * 0.59 + pa.data[p + 2] * 0.11) * 0.35;
          d.data[p] = hit ? 255 : grey;
          d.data[p + 1] = hit ? 0 : grey;
          d.data[p + 2] = hit ? 64 : grey;
          d.data[p + 3] = 255;
        }

        ctx.putImageData(d, 0, 0);

        const sizeNote = ib.naturalWidth !== w || ib.naturalHeight !== h
          ? ' size ' + ib.naturalWidth + 'x' + ib.naturalHeight + ' vs ' + w + 'x' + h
          : '';
        const label = a + ' vs ' + b + ': ' + (100 * changed / (w * h)).toFixed(2) + '%' + sizeNote;
        out[a + ' vs ' + b] = label.split(': ')[1];

        const fig = document.createElement('figure');
        fig.innerHTML = '<figcaption>' + label + '</figcaption>';
        fig.appendChild(canvas);
        document.getElementById('row-' + row).appendChild(fig);
      }

      return out;
    };
  </script></body></html>`;
}

async function proxy(req) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(req.url(), {
        method: req.method(),
        headers: req.headers(),
        body: req.postData(),
        redirect: 'manual',
      });
      const body = Buffer.from(await res.arrayBuffer());
      const headers = Object.fromEntries(res.headers.entries());
      delete headers['content-encoding'];
      delete headers['content-length'];
      await req.respond({ status: res.status, headers, body });

      return;
    } catch {
      await sleep(200 * attempt);
    }
  }

  await req.abort().catch(() => {});
}

function scenariosFromPlan(path) {
  if (!path || !existsSync(path)) {
    console.error('no PLAN.md found: pass --session <id>, --plan <file> or --scenarios a,b,c');
    process.exit(2);
  }

  const plan = readFileSync(path, 'utf8');

  return [...plan.matchAll(/^\| `([a-z0-9-]+)` \|/gm)].map((m) => m[1]);
}

function toDataUrl(png) {
  return `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
