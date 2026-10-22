import { describe, expect, it } from 'vitest';

import { menuRoute, routeForFramework, viewForUrl, viewFramework, withViews } from '../routes';

const SHADCN = 'integrations/shadcn';
const SHADCN_VUE = 'integrations/shadcn/vue';
const SHADCN_SVELTE = 'integrations/shadcn/svelte';

describe('framework views', () => {
  it('opens the page URL as the view of the chosen framework', () => {
    expect(viewForUrl(SHADCN, 'react')).toBe(SHADCN);
    expect(viewForUrl(SHADCN, 'vue')).toBe(SHADCN_VUE);
    expect(viewForUrl(SHADCN, 'svelte')).toBe(SHADCN_SVELTE);
  });

  it('keeps a view URL whatever framework is chosen', () => {
    expect(viewForUrl(SHADCN_VUE, 'react')).toBe(SHADCN_VUE);
    expect(viewForUrl(SHADCN_SVELTE, 'vue')).toBe(SHADCN_SVELTE);
    expect(viewFramework(SHADCN_VUE)).toBe('vue');
    expect(viewFramework(SHADCN_SVELTE)).toBe('svelte');
    expect(viewFramework(SHADCN)).toBeUndefined();
  });

  it('moves between views on a framework pick', () => {
    expect(routeForFramework(SHADCN_VUE, 'react')).toBe(SHADCN);
    expect(routeForFramework(SHADCN_VUE, 'svelte')).toBe(SHADCN_SVELTE);
    expect(routeForFramework(SHADCN_SVELTE, 'vue')).toBe(SHADCN_VUE);
    expect(routeForFramework(SHADCN, 'vue')).toBe(SHADCN_VUE);
  });

  it('leaves pages without views alone', () => {
    expect(viewForUrl('charts/line', 'vue')).toBe('charts/line');
    expect(routeForFramework('charts/line', 'vue')).toBe('charts/line');
  });

  it('shows a view under its page in the menu and in URL lists', () => {
    expect(menuRoute(SHADCN_VUE)).toBe(SHADCN);
    expect(menuRoute(SHADCN_SVELTE)).toBe(SHADCN);

    const routes = withViews([{ route: SHADCN, label: 'Shadcn', title: '' }]).map((entry) => entry.route);

    expect(routes).toEqual([SHADCN, SHADCN_VUE, SHADCN_SVELTE]);
  });
});
