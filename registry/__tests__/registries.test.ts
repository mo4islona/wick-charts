import { describe, expect, it } from 'vitest';

import react from '../shadcn/registry.json';
import vue from '../shadcn-vue/registry.json';

// The docs page and both demos read one block list, taken from the React registry.
function summary(items: { name: string; type: string; title: string }[]) {
  return items.map(({ name, type, title }) => ({ name, type, title }));
}

describe('shadcn registries', () => {
  it('list the same items in React and Vue', () => {
    expect(summary(vue.items)).toEqual(summary(react.items));
  });

  it('describe each block the same way', () => {
    const blocks = (items: typeof react.items) =>
      items.filter((item) => item.type === 'registry:block').map((item) => item.description);

    expect(blocks(vue.items)).toEqual(blocks(react.items));
  });
});
