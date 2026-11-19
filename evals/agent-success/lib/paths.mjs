import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EVAL = join(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = join(EVAL, '..', '..');
export const TEMPLATES = join(EVAL, 'templates');
export const CACHE = join(EVAL, '.cache');
export const RESULTS = join(EVAL, 'results');
export const SKILL = join(REPO, '.agents', 'skills', 'wick-charts');

// Outside the repo: an agent in a repo subfolder finds the repo's CLAUDE.md and skills.
export const WORKSPACES = join(tmpdir(), 'wick-agent-evals');
