import { describe, expect, it } from 'vitest';

import { buildApiReference } from '../../scripts/api-reference.mjs';
import manifest from '../data/api-manifest.json';

interface Prop {
  name: string;
  type: string;
  optional: boolean;
  defaultValue: string | null;
  deprecated: string | null;
  description: string;
  see: string[];
  nested?: { name: string; props: Prop[] };
}

function prop(fields: Partial<Prop> & { name: string }): Prop {
  return {
    type: 'number',
    optional: true,
    defaultValue: null,
    deprecated: null,
    description: '',
    see: [],
    ...fields,
  };
}

function reference(props: Prop[], component: { alias?: string; name?: string } = {}): string {
  const name = component.name ?? 'Demo';
  const entry = { kind: 'chart', file: '', alias: component.alias ?? null, description: '', props };

  return buildApiReference({ components: { [name]: entry } });
}

describe('buildApiReference', () => {
  it('nests option fields under their prop and marks only top-level props required', () => {
    const md = reference([
      prop({ name: 'data', type: 'TimePoint[]', optional: false, description: 'Series data.' }),
      prop({
        name: 'options',
        type: 'Partial<DemoOptions>',
        nested: { name: 'DemoOptions', props: [prop({ name: 'width', optional: false, defaultValue: '1' })] },
      }),
    ]);

    expect(md).toContain('## `<Demo>`');
    expect(md).toContain('- `data` (`TimePoint[]`, required): Series data.');
    expect(md).toContain('- `options` (`Partial<DemoOptions>`)');
    expect(md).toContain('  - `width` (`number`, default `1`)');
  });

  it('keeps a multi-line description inside its list item', () => {
    const md = reference([prop({ name: 'size', description: 'First line.\n\n```\nsize={2}\n```' })]);

    expect(md).toContain('- `size` (`number`): First line.\n\n  ```\n  size={2}\n  ```');
  });

  it('drops backticks inside a default so the inline code stays one span', () => {
    const md = reference([prop({ name: 'sticky', defaultValue: '{ min:` `500ms``, max:` `2500ms`` }' })]);

    expect(md).toContain('default `{ min: 500ms, max: 2500ms }`');
  });

  it('leaves the default to the description when the description states it', () => {
    const md = reference([prop({ name: 'width', defaultValue: '1', description: 'Stroke width. Default: 1.' })]);

    expect(md).toContain('- `width` (`number`): Stroke width. Default: 1.');
  });

  it('names an alias, a deprecation and a React-only component', () => {
    expect(reference([], { name: 'XAxis', alias: 'TimeAxis' })).toContain('## `<XAxis>` (alias `<TimeAxis>`)');
    expect(reference([prop({ name: 'old', deprecated: 'Use `fresh`.' })])).toContain('**Deprecated:** Use `fresh`.');
    expect(reference([], { name: 'Sparkline' })).toContain('React only.');
  });

  it('covers every component of the committed manifest', () => {
    const md = buildApiReference(manifest);

    for (const name of Object.keys(manifest.components)) {
      expect(md).toContain(`## \`<${name}>\``);
    }
  });
});
