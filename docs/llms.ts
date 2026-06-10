// Builds the /llms.txt manifest (https://llmstxt.org) from the same route
// table + SEO copy the site itself uses, so it can never drift from the docs.
// Consumed by the prerender crawler via `window.__WICK_LLMS_TXT__`
// (see docs/main.tsx) and written to docs-dist/llms.txt.

import { routeToPath } from './router';
import { type Route, type RouteEntry, getSections } from './routes';
import { DEFAULT_DESCRIPTION, SITE_NAME, SITE_URL, metaForRoute } from './seo';

/** Internal page with no value for LLM consumers (mirrors PRERENDER_ROUTES). */
const EXCLUDED: ReadonlySet<Route> = new Set<Route>(['stress-test']);

function lineFor(entry: RouteEntry): string {
  const { description } = metaForRoute(entry.route);

  return `- [${entry.label}](${SITE_URL}${routeToPath(entry.route)}): ${description}`;
}

function sectionBlock(heading: string, items: RouteEntry[]): string[] {
  const visible = items.filter((e) => !EXCLUDED.has(e.route));
  if (visible.length === 0) return [];

  return [`## ${heading}`, '', ...visible.map(lineFor), ''];
}

export function buildLlmsTxt(): string {
  const lines: string[] = [`# ${SITE_NAME}`, '', `> ${DEFAULT_DESCRIPTION}`, ''];

  for (const section of getSections()) {
    if (section.items) {
      // The ungrouped section only holds Overview — surface it as "Docs".
      lines.push(...sectionBlock(section.heading ?? 'Docs', section.items));
    }

    for (const sub of section.subsections ?? []) {
      const heading = [section.heading, sub.heading].filter(Boolean).join(' — ');
      lines.push(...sectionBlock(heading, sub.items ?? []));
    }
  }

  lines.push(
    '## Optional',
    '',
    `- [Full documentation](${SITE_URL}/llms-full.txt): Complete API guide with chart-type references and runnable use-case examples in a single file`,
  );

  return `${lines.join('\n').trimEnd()}\n`;
}
