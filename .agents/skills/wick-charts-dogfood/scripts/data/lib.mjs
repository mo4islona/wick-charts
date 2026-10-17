import { statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Run from the repo root; DOGFOOD_DATA_DIR overrides the target.
export const DATA_DIR = process.env.DOGFOOD_DATA_DIR ?? join(process.cwd(), 'test/dogfood/data');

const UA = 'wick-charts-dogfood/1.0 (https://github.com/mo4islona/wick-charts; test fixtures)';

export async function fetchRaw(url, { attempts = 3 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}: ${(await res.text()).slice(0, 200)}`);

      return await res.text();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr;
}

export async function fetchJson(url) {
  return JSON.parse(await fetchRaw(url));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');

export function fmtDur(ms) {
  const abs = Math.abs(ms);
  const sign = ms < 0 ? '-' : '';
  if (abs % 86_400_000 === 0 && abs >= 86_400_000) return `${sign}${abs / 86_400_000}d`;
  if (abs % 3_600_000 === 0 && abs >= 3_600_000) return `${sign}${abs / 3_600_000}h`;
  if (abs % 60_000 === 0 && abs >= 60_000) return `${sign}${abs / 60_000}m`;
  if (abs % 1000 === 0 && abs >= 1000) return `${sign}${abs / 1000}s`;

  return `${sign}${abs}ms`;
}

/** Time-axis profile: order, duplicates, delta histogram, gaps vs. the modal interval. */
export function timeProfile(times) {
  const n = times.length;
  const deltas = new Map();
  let asc = 0;
  let desc = 0;
  let dup = 0;
  for (let i = 1; i < n; i++) {
    const d = times[i] - times[i - 1];
    if (d > 0) asc++;
    else if (d < 0) desc++;
    else dup++;
    deltas.set(d, (deltas.get(d) ?? 0) + 1);
  }

  const sorted = [...deltas.entries()].sort((a, b) => b[1] - a[1]);
  const mode = sorted[0]?.[0] ?? 0;
  const order = desc === 0 ? 'ascending' : asc === 0 ? 'descending' : 'mixed';

  const gaps = [];
  if (mode !== 0) {
    for (let i = 1; i < n; i++) {
      const d = times[i] - times[i - 1];
      if (Math.abs(d) > Math.abs(mode))
        gaps.push({
          from: iso(times[i - 1]),
          to: iso(times[i]),
          delta: fmtDur(d),
          missing: Math.round(Math.abs(d) / Math.abs(mode)) - 1,
        });
    }
  }

  return {
    n,
    first: n ? iso(times[0]) : null,
    last: n ? iso(times[n - 1]) : null,
    order,
    ascSteps: asc,
    descSteps: desc,
    duplicateSteps: dup,
    modalInterval: fmtDur(mode),
    deltaHistogram: sorted.slice(0, 8).map(([d, c]) => `${fmtDur(d)}×${c}`),
    gaps,
  };
}

/** Per-column null count, min, max, negatives, zeros. */
export function columnProfile(rows, cols) {
  const out = {};
  for (const c of cols) {
    let nulls = 0;
    let min = Infinity;
    let max = -Infinity;
    let neg = 0;
    let zero = 0;
    for (const r of rows) {
      const v = Array.isArray(r) ? r[cols.indexOf(c)] : r[c];
      if (v === null || v === undefined || Number.isNaN(v)) {
        nulls++;
        continue;
      }
      if (typeof v !== 'number') continue;
      if (v < min) min = v;
      if (v > max) max = v;
      if (v < 0) neg++;
      if (v === 0) zero++;
    }
    out[c] = {
      nulls,
      min: min === Infinity ? null : min,
      max: max === -Infinity ? null : max,
      negatives: neg,
      zeros: zero,
    };
  }

  return out;
}

export function writeDataset(meta) {
  const file = join(DATA_DIR, `${meta.id}.json`);
  const body = { ...meta, fetchedAt: new Date().toISOString() };
  const ordered = {
    id: body.id,
    title: body.title,
    source: body.source,
    url: body.url,
    fetchedAt: body.fetchedAt,
    ...body,
  };
  writeFileSync(file, JSON.stringify(ordered));
  const size = statSync(file).size;
  console.log(`wrote ${file} (${(size / 1024 / 1024).toFixed(2)} MB)`);

  return size;
}

export function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(',');

  return lines.slice(1).map((l) => {
    const cells = l.split(',');
    const o = {};
    header.forEach((h, i) => {
      o[h] = cells[i];
    });

    return o;
  });
}
