#!/usr/bin/env node
// Headless capture for the dogfood apps.
//
// The Bash sandbox blocks Chrome's own sockets, so every request is proxied
// through Node (request interception + fetch). Vite's HMR websocket therefore
// never connects; its console noise is filtered out of the report.
//
// Usage:
//   node .agents/skills/wick-charts-dogfood/scripts/shot.mjs --url http://localhost:5181/?s=candles --out shots/react/candles.png
//     [--width 1280] [--height 900] [--dpr 1] [--wait 1500] [--selector '#scenario']
//     [--full] [--actions '[{"type":"hover","selector":"canvas","fx":0.5,"fy":0.5}]']
//
// Actions (run in order after the initial wait):
//   {"type":"wait","ms":300}
//   {"type":"hover","x":100,"y":200}                       absolute page coords
//   {"type":"hover","selector":"css","fx":0.5,"fy":0.5}    fraction of the element box
//   {"type":"wheel","selector":"css","fx":0.5,"fy":0.5,"deltaY":-400}
//   {"type":"drag","selector":"css","from":[0.6,0.5],"to":[0.3,0.5],"steps":12}
//   {"type":"click","selector":"css"}
//   {"type":"resize","width":600,"height":900}
//   {"type":"eval","js":"window.__something()"}            result goes to the JSON report
//   {"type":"shot","out":"path.png","selector":"css"}      extra screenshot mid-sequence
//
// Prints a JSON report to stdout: console messages, page errors, eval results.

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import puppeteer from 'puppeteer';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const NOISE = [/\[vite\]/, /WebSocket/, /websocket/, /Download the React DevTools/, /favicon\.ico/];

const { values: args } = parseArgs({
  options: {
    url: { type: 'string' },
    out: { type: 'string' },
    width: { type: 'string', default: '1280' },
    height: { type: 'string', default: '900' },
    dpr: { type: 'string', default: '1' },
    wait: { type: 'string', default: '1500' },
    selector: { type: 'string' },
    full: { type: 'boolean', default: false },
    actions: { type: 'string', default: '[]' },
  },
});

if (!args.url || !args.out) {
  console.error('usage: shot.mjs --url URL --out file.png [options]');
  process.exit(2);
}

const width = Number(args.width);
const height = Number(args.height);
const dpr = Number(args.dpr);
const actions = JSON.parse(args.actions);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [`--force-device-scale-factor=${dpr}`, '--hide-scrollbars'],
  defaultViewport: { width, height, deviceScaleFactor: dpr },
});

const report = { url: args.url, console: [], pageErrors: [], failedRequests: [], evals: [], shots: [] };

try {
  const page = await browser.newPage();

  await page.setRequestInterception(true);
  // Under load the dev server drops proxied requests at random; retry before giving up.
  page.on('request', async (req) => {
    let lastError = null;

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
      } catch (err) {
        lastError = err;
        await sleep(200 * attempt);
      }
    }

    report.failedRequests.push({ url: req.url(), error: String(lastError) });
    await req.abort().catch(() => {});
  });

  page.on('console', (msg) => {
    const text = msg.text();
    if (NOISE.some((re) => re.test(text))) return;

    report.console.push({ type: msg.type(), text });
  });
  page.on('pageerror', (err) => {
    report.pageErrors.push(String(err?.stack ?? err));
  });

  await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await sleep(Number(args.wait));

  for (const action of actions) {
    await runAction(page, action);
  }

  await capture(page, { out: args.out, selector: args.selector, full: args.full });
} finally {
  await browser.close();
}

console.log(JSON.stringify(report, null, 2));

async function runAction(page, action) {
  switch (action.type) {
    case 'wait':
      await sleep(action.ms);
      break;
    case 'hover': {
      const [x, y] = await point(page, action);
      await page.mouse.move(x, y, { steps: 4 });
      break;
    }
    case 'wheel': {
      const [x, y] = await point(page, action);
      await page.mouse.move(x, y);
      await page.mouse.wheel({ deltaY: action.deltaY ?? -300, deltaX: action.deltaX ?? 0 });
      break;
    }
    case 'drag': {
      const box = await elementBox(page, action.selector);
      const from = [box.x + box.width * action.from[0], box.y + box.height * action.from[1]];
      const to = [box.x + box.width * action.to[0], box.y + box.height * action.to[1]];
      await page.mouse.move(from[0], from[1]);
      await page.mouse.down();
      await page.mouse.move(to[0], to[1], { steps: action.steps ?? 12 });
      await page.mouse.up();
      break;
    }
    case 'click':
      await page.click(action.selector);
      break;
    case 'resize':
      await page.setViewport({ width: action.width, height: action.height, deviceScaleFactor: dpr });
      break;
    case 'eval': {
      const result = await page.evaluate(action.js);
      report.evals.push({ js: action.js, result });
      break;
    }
    case 'shot':
      await capture(page, { out: action.out, selector: action.selector, full: false });
      break;
    default:
      throw new Error(`unknown action ${action.type}`);
  }
}

async function point(page, action) {
  if (action.selector) {
    const box = await elementBox(page, action.selector);

    return [box.x + box.width * (action.fx ?? 0.5), box.y + box.height * (action.fy ?? 0.5)];
  }

  return [action.x, action.y];
}

async function elementBox(page, selector) {
  const el = await page.waitForSelector(selector, { timeout: 10_000 });
  const box = await el.boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);

  return box;
}

async function capture(page, { out, selector, full }) {
  const path = resolve(out);
  mkdirSync(dirname(path), { recursive: true });

  if (selector) {
    const el = await page.waitForSelector(selector, { timeout: 10_000 });
    await el.screenshot({ path });
  } else {
    await page.screenshot({ path, fullPage: full });
  }

  report.shots.push(path);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
