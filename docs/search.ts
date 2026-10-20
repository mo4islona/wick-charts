// Client-side docs search behind the sidebar box (⌘K). The index is small
// (pages, guide steps, API props — a few hundred entries), so it is built once
// in the browser and matched with plain substring scoring; no search service.

import type { Route, RouteSection } from './routes';

export type SearchKind = 'page' | 'step' | 'prop';

export interface SearchEntry {
  kind: SearchKind;
  label: string;
  /** Where the entry lives, e.g. `Guides › Axes` or `BarSeries · options`. */
  hint: string;
  route: Route;
  /** Element id on the target page to scroll to. */
  hash?: string;
  /** Lowercased label — matches here outrank matches elsewhere in `text`. */
  key: string;
  /** Lowercased label, hint and any extra words worth matching. */
  text: string;
}

export interface SearchGroup {
  kind: SearchKind;
  title: string;
  entries: SearchEntry[];
}

export interface ManifestProp {
  name: string;
  nested?: { props: ManifestProp[] } | null;
}

export interface SearchSources {
  sections: RouteSection[];
  /** Extra words per page (e.g. its meta description), matched but not shown. */
  describe: (route: Route) => string;
  /** Walkthrough step headings per guide route. */
  steps: Partial<Record<Route, string[]>>;
  /** API route → its manifest props. */
  props: Partial<Record<Route, { component: string; props: ManifestProp[] }>>;
}

const GROUPS: { kind: SearchKind; title: string; limit: number }[] = [
  { kind: 'page', title: 'Pages', limit: 6 },
  { kind: 'step', title: 'Guide steps', limit: 5 },
  { kind: 'prop', title: 'API props', limit: 8 },
];

// Props every component has, or that only take markup: noise in a search.
const SKIPPED_PROPS = new Set(['children', 'className', 'style']);

/** Element id of a prop row on an API page; nested props join their path with dots. */
export function propAnchor(path: string): string {
  return `prop-${path}`;
}

function entry(args: Omit<SearchEntry, 'key' | 'text'> & { extra?: string }): SearchEntry {
  const { extra = '', ...rest } = args;
  const key = rest.label.toLowerCase();

  return { ...rest, key, text: `${key} ${rest.hint.toLowerCase()} ${extra.toLowerCase()}` };
}

/**
 * `'02 — APPEND A BAR vs UPDATE THE FORMING ONE'` → `'Append a bar vs update the forming one'`.
 * Mixed-case words are code (`appendData`) and stay as written; X / Y / Z are axis names.
 */
export function stepTitle(heading: string): string {
  const words = heading.replace(/^\s*\d+\s*—\s*/, '').split(' ');
  let shouted = false;

  const lowered = words.map((word, i) => {
    const isUpper = /[A-Z]/.test(word) && word === word.toUpperCase();
    if (!isUpper) return word;

    if (i === 0) shouted = true;
    if (/^[XYZ]$/.test(word)) return word;

    return word.toLowerCase();
  });

  const text = lowered.join(' ');
  if (!shouted) return text;

  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function buildSearchIndex(sources: SearchSources): SearchEntry[] {
  const out: SearchEntry[] = [];
  const pageLabels = new Map<Route, string>();

  for (const section of sources.sections) {
    const groups = section.subsections ?? [{ heading: null, items: section.items }];

    for (const group of groups) {
      const hint = [section.heading, group.heading].filter(Boolean).join(' › ');

      for (const item of group.items ?? []) {
        pageLabels.set(item.route, item.label);
        out.push(
          entry({ kind: 'page', label: item.label, hint, route: item.route, extra: sources.describe(item.route) }),
        );
      }
    }
  }

  for (const [route, headings] of Object.entries(sources.steps) as [Route, string[]][]) {
    const guide = pageLabels.get(route);
    if (!guide) continue;

    for (const heading of headings) {
      out.push(entry({ kind: 'step', label: stepTitle(heading), hint: guide, route }));
    }
  }

  for (const [route, api] of Object.entries(sources.props) as [Route, { component: string; props: ManifestProp[] }][]) {
    if (!pageLabels.has(route)) continue;

    for (const prop of api.props) {
      if (SKIPPED_PROPS.has(prop.name)) continue;

      out.push(entry({ kind: 'prop', label: prop.name, hint: api.component, route, hash: propAnchor(prop.name) }));

      for (const child of prop.nested?.props ?? []) {
        const path = `${prop.name}.${child.name}`;
        const hint = `${api.component} · ${prop.name}`;
        out.push(entry({ kind: 'prop', label: child.name, hint, route, hash: propAnchor(path) }));
      }
    }
  }

  return out;
}

function score(entry: SearchEntry, tokens: string[]): number {
  let total = 0;

  for (const token of tokens) {
    if (!entry.text.includes(token)) return 0;

    if (entry.key === token) {
      total += 100;
    } else if (entry.key.startsWith(token)) {
      total += 50;
    } else if (entry.key.includes(token)) {
      total += 20;
    } else {
      total += 1;
    }
  }

  return total;
}

/** Matches for `query`, grouped by kind and ranked best first. Every token must match. */
export function searchDocs(index: SearchEntry[], query: string): SearchGroup[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const ranked = index
    .map((e) => ({ entry: e, score: score(e, tokens) }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.label.length - b.entry.label.length);

  const groups: SearchGroup[] = [];

  for (const group of GROUPS) {
    const entries = ranked
      .filter((hit) => hit.entry.kind === group.kind)
      .slice(0, group.limit)
      .map((hit) => hit.entry);

    if (entries.length > 0) groups.push({ kind: group.kind, title: group.title, entries });
  }

  return groups;
}
