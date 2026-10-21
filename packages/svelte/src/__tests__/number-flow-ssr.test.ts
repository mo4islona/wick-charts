// @vitest-environment node
import { formatSignificant } from '@wick-charts/core';
import { describe, expect, it } from 'vitest';

import NumberFlow from '../ui/NumberFlow.svelte';

// In a node environment the Svelte plugin compiles components for the server.
interface ServerComponent {
  render(props: { value: number; format?: (value: number) => string }): { html: string };
}

const ServerNumberFlow = NumberFlow as unknown as ServerComponent;

describe('<NumberFlow> (Svelte) server rendering', () => {
  it('puts the formatted number in the server HTML', () => {
    const { html } = ServerNumberFlow.render({ value: 1234.5 });

    expect(html).toMatch(new RegExp(`<span[^>]*>${formatSignificant(1234.5)}</span>`));
  });

  it('escapes the text of a custom formatter', () => {
    const { html } = ServerNumberFlow.render({ value: 1, format: () => '<1>' });

    expect(html).toContain('&lt;1');
    expect(html).not.toContain('<1>');
  });
});
