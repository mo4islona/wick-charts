import { describe, expect, it } from 'vitest';

import react from '../shadcn/registry.json';
import svelte from '../shadcn-svelte/registry.json';
import vue from '../shadcn-vue/registry.json';

// The docs page and every demo read one block list, taken from the React registry.
function summary(items: { name: string; type: string; title: string }[]) {
  return items.map(({ name, type, title }) => ({ name, type, title }));
}

describe('shadcn registries', () => {
  it('list the same items in React, Vue and Svelte', () => {
    expect(summary(vue.items)).toEqual(summary(react.items));
    expect(summary(svelte.items)).toEqual(summary(react.items));
  });

  it('describe each block the same way', () => {
    const blocks = (items: typeof react.items) =>
      items.filter((item) => item.type === 'registry:block').map((item) => item.description);

    expect(blocks(vue.items)).toEqual(blocks(react.items));
    expect(blocks(svelte.items)).toEqual(blocks(react.items));
  });

  it('pin the same library version in every Svelte item', () => {
    const pins = new Set(svelte.items.flatMap((item) => item.dependencies));

    expect([...pins]).toEqual([expect.stringMatching(/^@wick-charts\/svelte@\^\d+\.\d+\.\d+$/)]);
  });
});
