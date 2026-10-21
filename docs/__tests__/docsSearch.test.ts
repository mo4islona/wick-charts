import { describe, expect, it } from 'vitest';

import { CHART_DEMO_TO_API, CHART_GUIDES, type RouteSection, adjacentGuides, getSections, isRoute } from '../routes';
import { type SearchSources, buildSearchIndex, propAnchor, searchDocs, stepTitle } from '../search';

const SECTIONS: RouteSection[] = [
  { heading: null, items: [{ route: 'overview', label: 'Overview', title: '' }] },
  {
    heading: 'Charts',
    subsections: [{ heading: 'Time series', items: [{ route: 'charts/bar', label: 'Bar', title: 'Bar' }] }],
  },
  {
    heading: 'Guides',
    subsections: [
      {
        heading: 'Axes',
        items: [{ route: 'use-cases/category-bars', label: 'Category bars', title: 'Category bars' }],
      },
    ],
  },
  {
    heading: 'API',
    subsections: [{ heading: 'Charts', items: [{ route: 'api/bar-series', label: 'BarSeries', title: '' }] }],
  },
];

const SOURCES: SearchSources = {
  sections: SECTIONS,
  describe: (route) => (route === 'charts/bar' ? 'Bar and column charts with real-time updates' : ''),
  steps: { 'use-cases/category-bars': ['01 — PUT NAMES ON X', '03 — FIX THE ORDER'] },
  props: {
    'api/bar-series': {
      component: 'BarSeries',
      props: [
        { name: 'data' },
        { name: 'children' },
        { name: 'options', nested: { props: [{ name: 'valueLabels' }, { name: 'stacking' }] } },
      ],
    },
  },
};

describe('stepTitle', () => {
  it('turns a shouted heading into sentence case', () => {
    expect(stepTitle('01 — FIX THE ORDER')).toBe('Fix the order');
  });

  it('keeps code identifiers and axis letters as written', () => {
    expect(stepTitle('02 — appendData / updateData / keepLast')).toBe('appendData / updateData / keepLast');
    expect(stepTitle('01 — PUT NAMES ON X')).toBe('Put names on X');
    expect(stepTitle('02 — APPEND A BAR vs UPDATE THE FORMING ONE')).toBe('Append a bar vs update the forming one');
  });
});

describe('searchDocs', () => {
  const index = buildSearchIndex(SOURCES);

  it('finds pages by label and section, with the section path as the hint', () => {
    const [pages] = searchDocs(index, 'category');

    expect(pages.kind).toBe('page');
    expect(pages.entries[0]).toMatchObject({
      label: 'Category bars',
      hint: 'Guides › Axes',
      route: 'use-cases/category-bars',
    });
  });

  it('matches page descriptions without showing them', () => {
    const groups = searchDocs(index, 'real-time');

    expect(groups[0].entries[0].route).toBe('charts/bar');
  });

  it('indexes guide steps under their guide', () => {
    const steps = searchDocs(index, 'order').find((group) => group.kind === 'step');

    expect(steps?.entries[0]).toMatchObject({ label: 'Fix the order', hint: 'Category bars' });
  });

  it('links nested props to their dotted anchor and skips markup props', () => {
    const props = searchDocs(index, 'valueLabels').find((group) => group.kind === 'prop');

    expect(props?.entries[0]).toMatchObject({
      hint: 'BarSeries · options',
      route: 'api/bar-series',
      hash: propAnchor('options.valueLabels'),
    });
    expect(searchDocs(index, 'children')).toEqual([]);
  });

  it('requires every token and ranks a label match above a text match', () => {
    expect(searchDocs(index, 'bar zebra')).toEqual([]);

    const [pages] = searchDocs(index, 'bar');
    expect(pages.entries.map((e) => e.label)).toEqual(['Bar', 'BarSeries', 'Category bars']);
  });

  it('returns nothing for a blank query', () => {
    expect(searchDocs(index, '   ')).toEqual([]);
  });
});

describe('docs navigation', () => {
  const guides = getSections().find((s) => s.heading === 'Guides')?.items ?? [];

  it('keeps the top-level sections', () => {
    expect(getSections().map((s) => s.heading)).toEqual([null, 'Charts', 'Guides', 'Integrations', 'Resources', 'API']);
  });

  it('links chart pages only to guides that exist', () => {
    const guideRoutes = new Set(guides.map((g) => g.route));

    for (const linked of Object.values(CHART_GUIDES)) {
      for (const route of linked ?? []) {
        expect(guideRoutes.has(route)).toBe(true);
      }
    }
  });

  it('maps each chart page to its series API page', () => {
    expect(CHART_DEMO_TO_API['charts/bar']).toBe('api/bar-series');
    expect(Object.values(CHART_DEMO_TO_API).every((route) => route !== undefined && isRoute(route))).toBe(true);
  });

  it('chains guides in sidebar order', () => {
    const first = guides[0].route;
    const last = guides[guides.length - 1].route;

    expect(adjacentGuides(first).prev).toBeNull();
    expect(adjacentGuides(first).next?.route).toBe(guides[1].route);
    expect(adjacentGuides(last).next).toBeNull();
    expect(adjacentGuides('charts/bar')).toEqual({ prev: null, next: null });
  });
});
