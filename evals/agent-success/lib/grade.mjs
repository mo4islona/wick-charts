// Grades one workspace: typecheck, build, a headless render, then an LLM judge on the code and the screenshot.

import { execFile, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { promisify } from 'node:util';

import puppeteer from 'puppeteer';

import { runClaude } from './agent.mjs';

const exec = promisify(execFile);

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const NOISE = [/\[vite\]/, /favicon\.ico/, /Download the React DevTools/, /\[vue\] devtools/i];

const TYPECHECK = {
  react: ['tsc', ['-p', 'tsconfig.json']],
  vue: ['vue-tsc', ['-p', 'tsconfig.json']],
  svelte: ['svelte-check', ['--tsconfig', './tsconfig.json', '--threshold', 'error', '--output', 'human']],
};

const tail = (text, lines = 40) =>
  String(text ?? '')
    .trim()
    .split('\n')
    .slice(-lines)
    .join('\n');

async function bin({ cwd, name, args }) {
  try {
    const { stdout, stderr } = await exec(join(cwd, 'node_modules', '.bin', name), args, {
      cwd,
      timeout: 180_000,
      maxBuffer: 32 * 1024 * 1024,
    });

    return { ok: true, output: tail(`${stdout}\n${stderr}`) };
  } catch (error) {
    return { ok: false, output: tail(`${error.stdout ?? ''}\n${error.stderr ?? ''}\n${error.message}`) };
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const up = await fetch(url).then(
      (r) => r.ok,
      () => false,
    );
    if (up) return true;

    await new Promise((r) => setTimeout(r, 250));
  }

  return false;
}

// Runs in the page. A canvas counts as drawn when a downscaled copy has visible pixels; a thin line
// on a transparent canvas covers well under 1% of it.
function inspectCanvases() {
  const probe = document.createElement('canvas');
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  const canvases = [...document.querySelectorAll('canvas')];

  return canvases.map((canvas) => {
    const box = canvas.getBoundingClientRect();
    const result = { width: Math.round(box.width), height: Math.round(box.height), colors: 0, ink: 0 };
    if (!ctx || canvas.width === 0 || canvas.height === 0) return result;

    probe.width = 400;
    probe.height = Math.max(1, Math.round((400 * canvas.height) / canvas.width));
    ctx.clearRect(0, 0, probe.width, probe.height);
    ctx.drawImage(canvas, 0, 0, probe.width, probe.height);

    const { data } = ctx.getImageData(0, 0, probe.width, probe.height);
    const colors = new Set();
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 16) continue;

      ink++;
      colors.add(((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4));
    }

    result.colors = colors.size;
    result.ink = ink / (probe.width * probe.height);

    return result;
  });
}

/** @param {{ cwd: string, outDir: string, waitMs: number }} options */
async function render({ cwd, outDir, waitMs }) {
  const port = await freePort();
  const server = spawn(join(cwd, 'node_modules', '.bin', 'vite'), ['preview', '--port', String(port), '--strictPort'], {
    cwd,
    detached: true,
    stdio: 'ignore',
  });
  const stop = () => {
    try {
      process.kill(-server.pid, 'SIGKILL');
    } catch {
      // Already gone.
    }
  };

  const url = `http://localhost:${port}/`;
  const result = { ok: false, errors: [], warnings: [], canvases: [], screenshot: join(outDir, 'screenshot.png') };
  let browser;

  try {
    if (!(await waitFor(url, 20_000))) {
      result.errors.push('vite preview did not start');

      return result;
    }

    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);

    page.on('console', (message) => {
      const text = message.text();
      if (NOISE.some((re) => re.test(text))) return;

      if (message.type() === 'error') result.errors.push(`console.error: ${text}`.slice(0, 600));
      if (message.type() === 'warning') result.warnings.push(text.slice(0, 600));
    });
    page.on('pageerror', (error) => result.errors.push(`pageerror: ${error.message}`.slice(0, 600)));

    await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
    await new Promise((r) => setTimeout(r, waitMs));

    result.canvases = await page.evaluate(inspectCanvases);
    await page.screenshot({ path: result.screenshot, fullPage: true });

    const drawn = result.canvases.some((c) => c.width > 0 && c.height > 0 && c.colors >= 2 && c.ink > 0.002);
    const libraryWarnings = result.warnings.filter((w) => w.includes('[wick-charts]'));
    if (result.canvases.length === 0) result.errors.push('no <canvas> on the page');
    else if (!drawn) result.errors.push('no canvas has a drawn chart');
    for (const warning of libraryWarnings) {
      result.errors.push(`library warning: ${warning}`);
    }

    result.ok = result.errors.length === 0;

    return result;
  } catch (error) {
    result.errors.push(`render failed: ${error.message}`);

    return result;
  } finally {
    await browser?.close();
    stop();
  }
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['criteria', 'findings'],
  properties: {
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        required: ['criterion', 'pass', 'evidence'],
        properties: { criterion: { type: 'string' }, pass: { type: 'boolean' }, evidence: { type: 'string' } },
      },
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['kind', 'blocking', 'summary', 'suggestion'],
        properties: {
          kind: { enum: ['api', 'error-message', 'skill', 'docs', 'agent', 'harness'] },
          blocking: { type: 'boolean' },
          summary: { type: 'string' },
          suggestion: { type: 'string' },
        },
      },
    },
  },
};

function judgePrompt({ testCase, checks, agent, changedFiles }) {
  const friction = agent.friction
    .map((f) => `- ${f.tool}: ${f.input}\n  ${f.error.replaceAll('\n', '\n  ')}`)
    .join('\n');

  return `You grade one run of a coding agent. A user asked the agent, in a fresh ${testCase.framework} + Vite app,
to build a chart with the Wick Charts library (@wick-charts/${testCase.framework}). The agent had the wick-charts
skill at .claude/skills/wick-charts/ (it may or may not have read it). The goal of this grading is to improve the
LIBRARY, not to blame the agent: each problem should point at an API change, an error message or a skill change.

## The user's prompt
${testCase.prompt}

## Criteria (grade each one)
${testCase.criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## Automated checks (already run)
- typecheck: ${checks.typecheck.ok ? 'ok' : `FAILED\n${checks.typecheck.output}`}
- build: ${checks.build.ok ? 'ok' : `FAILED\n${checks.build.output}`}
- render in headless Chrome: ${checks.render.ok ? 'ok' : `FAILED\n${checks.render.errors.join('\n')}`}
- canvases: ${JSON.stringify(checks.render.canvases)}
- console warnings: ${checks.render.warnings.slice(0, 10).join(' | ') || 'none'}

## Where the agent stumbled (failed tool calls during its run)
${friction || 'none'}

Skill invoked: ${agent.skillInvoked ? 'yes (SKILL.md loaded)' : 'no'}. Other skill files read: ${agent.skillReads.join(', ') || 'none'}.
Commands that read the package .d.ts: ${agent.typeReads}. Commands that read the compiled library source (dist/*.js): ${agent.sourceReads}.
A read of the compiled source means the skill and the types did not answer a question: name that question.

## What to do
1. Read the changed files: ${changedFiles.join(', ') || '(none)'}.
2. Look at the screenshot .eval/screenshot.png (the page after a few seconds; live network data may be absent if
   the network failed — judge the code then).
3. Grade each criterion: pass only if the code does it and nothing on the screenshot contradicts it.
4. List findings: every place where the agent went wrong or lost time, also when it recovered. For each, pick:
   - api: the library API invites the mistake (confusing name, missing option, inconsistent across frameworks);
   - error-message: the library failed silently or with an unclear message where a clear error/warning would have led the agent to the fix;
   - skill: the skill is missing, wrong or hard to find for this task;
   - docs: the type declarations or API docs are missing or wrong;
   - agent: a plain agent mistake that no library change would prevent;
   - harness: the eval setup itself (network, template) caused it.
   blocking = true when the finding made a criterion or a check fail. suggestion = the concrete change to make.
Be strict and concrete. Do not edit any files.`;
}

/** @param {{ cwd: string, testCase: object, checks: object, agent: object, model: string, logFile: string }} options */
async function judge({ cwd, testCase, checks, agent, model, logFile }) {
  const { stdout } = await exec('git', ['status', '--porcelain', '--untracked-files=all'], { cwd });
  const changedFiles = stdout
    .split('\n')
    .map((line) => line.slice(3).trim())
    .filter((f) => f && !f.startsWith('.eval/'));

  const args = [
    '-p',
    judgePrompt({ testCase, checks, agent, changedFiles }),
    '--output-format',
    'stream-json',
    '--verbose',
    '--setting-sources',
    'project',
    '--strict-mcp-config',
    '--tools',
    'Read,Glob,Grep',
    '--json-schema',
    JSON.stringify(VERDICT_SCHEMA),
    '--model',
    model,
    '--max-turns',
    '30',
    '--no-session-persistence',
  ];

  const { events, timedOut } = await runClaude({ cwd, args, timeoutMs: 10 * 60_000, logFile });
  const result = events.find((e) => e.type === 'result');
  const verdict = result?.structured_output ?? safeParse(result?.result);
  if (!verdict || timedOut) {
    return { ok: false, error: timedOut ? 'judge timed out' : 'judge gave no verdict', criteria: [], findings: [] };
  }

  const ok = verdict.criteria.length > 0 && verdict.criteria.every((c) => c.pass);

  return { ok, costUsd: result?.total_cost_usd ?? null, ...verdict };
}

function safeParse(text) {
  if (typeof text !== 'string') return null;

  const json = text.match(/\{[\s\S]*\}/);
  if (!json) return null;

  try {
    return JSON.parse(json[0]);
  } catch {
    return null;
  }
}

/**
 * @param {{ cwd: string, testCase: object, agent: object, judgeModel: string }} options
 * @returns {Promise<object>} the grade; `success` is the first-try verdict
 */
export async function grade({ cwd, testCase, agent, judgeModel }) {
  const outDir = join(cwd, '.eval');
  mkdirSync(outDir, { recursive: true });

  const [name, args] = TYPECHECK[testCase.framework];
  const typecheck = await bin({ cwd, name, args });
  const build = await bin({ cwd, name: 'vite', args: ['build', '--logLevel', 'error'] });
  const renderResult = build.ok
    ? await render({ cwd, outDir, waitMs: testCase.network ? 8000 : 3000 })
    : { ok: false, errors: ['skipped: the build failed'], warnings: [], canvases: [], screenshot: null };

  const checks = { typecheck, build, render: renderResult };
  const verdict = await judge({
    cwd,
    testCase,
    checks,
    agent,
    model: judgeModel,
    logFile: join(outDir, 'judge.jsonl'),
  });

  const success = typecheck.ok && build.ok && renderResult.ok && verdict.ok;
  const gradeResult = { success, checks, judge: verdict };
  writeFileSync(join(outDir, 'grade.json'), JSON.stringify(gradeResult, null, 2));

  return gradeResult;
}
