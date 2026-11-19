// One agent run: a fresh app, the skill installed the way `npx skills add` installs it, one prompt.

import { execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SKILL, TEMPLATES } from './paths.mjs';

const ALLOWED_TOOLS = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'Skill', 'TodoWrite', 'WebFetch', 'WebSearch'];
const DISALLOWED_TOOLS = ['AskUserQuestion', 'Agent'];

// The user's own settings, hooks, plugins, MCP servers and CLAUDE.md must not steer the agent.
const SETTINGS = JSON.stringify({ autoMemoryEnabled: false });

/** Copies with an APFS / reflink clone where the file system has one, so node_modules costs no disk. */
function cloneDir(from, to) {
  const flags = process.platform === 'darwin' ? ['-cR'] : ['-R', '--reflink=auto'];
  execFileSync('cp', [...flags, from, to]);
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

/** @param {{ dir: string, framework: string, cachedApp: string, withSkill: boolean }} options */
export function createWorkspace({ dir, framework, cachedApp, withSkill }) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  cpSync(join(TEMPLATES, framework), dir, { recursive: true });
  cpSync(join(cachedApp, 'package.json'), join(dir, 'package.json'));
  cpSync(join(cachedApp, 'package-lock.json'), join(dir, 'package-lock.json'));
  cloneDir(join(cachedApp, 'node_modules'), join(dir, 'node_modules'));

  if (withSkill) {
    cpSync(SKILL, join(dir, '.claude', 'skills', 'wick-charts'), { recursive: true });
  }

  writeFileSync(join(dir, '.gitignore'), 'node_modules\ndist\n.vite\n.eval\n');
  git(dir, ['init', '-q']);
  git(dir, ['add', '-A']);
  git(dir, ['-c', 'user.name=eval', '-c', 'user.email=eval@localhost', 'commit', '-qm', 'init']);
}

/** Env of this process minus the variables that tell a child it runs inside another Claude Code session. */
export function childEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    const nested = key === 'CLAUDECODE' || key.startsWith('CLAUDE_CODE_') || key === 'CLAUDE_PID';
    if (nested) delete env[key];
  }

  return env;
}

/**
 * Runs `claude -p` and resolves when it exits or times out.
 * @param {{ cwd: string, args: string[], timeoutMs: number, logFile: string }} options
 * @returns {Promise<{ events: object[], timedOut: boolean, exitCode: number | null }>}
 */
export function runClaude({ cwd, args, timeoutMs, logFile }) {
  return new Promise((resolve) => {
    // A new process group, so a dev server the agent left behind dies with it.
    const child = spawn('claude', args, { cwd, env: childEnv(), detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const events = [];
    const raw = [];
    let buffer = '';
    let timedOut = false;

    const killGroup = () => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // The group is gone.
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killGroup();
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;

        raw.push(line);
        try {
          events.push(JSON.parse(line));
        } catch {
          // Not a stream-json line.
        }
      }
    });
    child.stderr.on('data', (chunk) => raw.push(`[stderr] ${chunk}`));

    child.on('close', (exitCode) => {
      clearTimeout(timer);
      killGroup();
      writeFileSync(logFile, `${raw.join('\n')}\n`);

      resolve({ events, timedOut, exitCode });
    });
  });
}

/** @param {{ cwd: string, prompt: string, model?: string, maxTurns: number, timeoutMs: number, logFile: string }} options */
export async function runAgent({ cwd, prompt, model, maxTurns, timeoutMs, logFile }) {
  const args = [
    '-p',
    prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    '--setting-sources',
    'project',
    '--settings',
    SETTINGS,
    '--strict-mcp-config',
    '--permission-mode',
    'acceptEdits',
    '--allowedTools',
    ...ALLOWED_TOOLS,
    '--disallowedTools',
    ...DISALLOWED_TOOLS,
    '--max-turns',
    String(maxTurns),
    '--no-session-persistence',
  ];
  if (model) args.push('--model', model);

  const { events, timedOut, exitCode } = await runClaude({ cwd, args, timeoutMs, logFile });

  return { ...summarize(events), timedOut, exitCode };
}

function toolResultText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  return content.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('\n');
}

/**
 * Reduces the stream to what the report and the judge need: cost, turns, what the agent read
 * (skill files, type declarations, the compiled library source) and its failed tool calls.
 */
export function summarize(events) {
  const init = events.find((e) => e.type === 'system' && e.subtype === 'init');
  const result = events.find((e) => e.type === 'result');
  const calls = new Map();
  const skillReads = new Set();
  const friction = [];
  let skillInvoked = false;
  let typeReads = 0;
  let sourceReads = 0;

  for (const event of events) {
    const content = event.message?.content;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      if (part.type === 'tool_use') {
        calls.set(part.id, part);

        // Agents read files with Read and just as often with cat / sed / awk / grep.
        const text = part.name === 'Bash' ? String(part.input?.command ?? '') : String(part.input?.file_path ?? '');
        const readsFiles = part.name === 'Read' || part.name === 'Bash';
        if (readsFiles) {
          for (const match of text.matchAll(/\.claude\/skills\/wick-charts\/([\w.-]+\.md)/g)) {
            skillReads.add(match[1]);
          }
          if (/@wick-charts\/\w+\/dist\/[\w./-]*\.d\.ts|\$T\b/.test(text)) typeReads++;
          if (/@wick-charts\/\w+\/dist\/[\w./-]*\.(?:js|cjs|mjs|svelte)\b/.test(text)) sourceReads++;
        }
        if (part.name === 'Skill' && String(part.input?.skill ?? '').includes('wick-charts')) skillInvoked = true;

        continue;
      }

      if (part.type !== 'tool_result' || !part.is_error) continue;

      const call = calls.get(part.tool_use_id);
      const input = call?.name === 'Bash' ? call.input?.command : JSON.stringify(call?.input ?? {});
      friction.push({
        tool: call?.name ?? 'unknown',
        input: String(input).slice(0, 300),
        error: toolResultText(part.content).slice(0, 1200),
      });
    }
  }

  return {
    model: init?.model ?? null,
    skillLoaded: Boolean(init?.skills?.includes?.('wick-charts')),
    skillInvoked,
    skillReads: [...skillReads].sort(),
    typeReads,
    sourceReads,
    friction,
    turns: result?.num_turns ?? null,
    costUsd: result?.total_cost_usd ?? null,
    durationMs: result?.duration_ms ?? null,
    stopReason: result?.subtype ?? 'no-result',
    finalMessage: typeof result?.result === 'string' ? result.result.slice(0, 2000) : '',
  };
}
