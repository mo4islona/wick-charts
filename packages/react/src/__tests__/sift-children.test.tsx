import { type ReactNode, isValidElement } from 'react';

import { describe, expect, it } from 'vitest';

import { siftContainerChildren } from '../ChartContainer';
import { InfoBar } from '../ui/InfoBar';
import { Legend } from '../ui/Legend';
import { Title } from '../ui/Title';

// `<ChartContainer>` receives `children` as whatever React passes for JSX
// children — typically an array of elements (for multiple children) or a
// single element. `Children.forEach` is what flattens that. Passing a
// `<Fragment>` ELEMENT instead of its children is not the same thing:
// React treats the fragment as one atomic child. These tests simulate the
// real shape by passing arrays.
function kids(...nodes: ReactNode[]): ReactNode[] {
  return nodes;
}

describe('siftContainerChildren', () => {
  it('hoists Title, Legend and InfoBar, leaves the rest in overlay', () => {
    const overlayNode = <span id="overlay-marker" />;
    const result = siftContainerChildren(kids(<Title>BTC</Title>, <Legend />, <InfoBar />, overlayNode));
    expect(result.titleEl).not.toBeNull();
    expect(result.legendEl).not.toBeNull();
    expect(result.tooltipLegendEl).not.toBeNull();
    expect(result.overlay).toHaveLength(1);
    const first = result.overlay[0];
    expect(isValidElement(first) && (first.props as { id?: string }).id).toBe('overlay-marker');
  });

  it('hoists Title from inside a fragment', () => {
    const result = siftContainerChildren(
      <>
        <Title sub="1m">BTC/USD</Title>
        <span id="rest" />
      </>,
    );
    expect(result.titleEl).not.toBeNull();
    expect(result.overlay).toHaveLength(1);
  });

  it('child order does not matter', () => {
    const result = siftContainerChildren(
      kids(<span id="a" />, <InfoBar />, <span id="b" />, <Legend />, <span id="c" />),
    );
    expect(result.tooltipLegendEl).not.toBeNull();
    expect(result.legendEl).not.toBeNull();
    expect(result.overlay).toHaveLength(3);
  });

  it('tolerates absent Title / Legend / InfoBar', () => {
    const r1 = siftContainerChildren(<span />);
    expect(r1.titleEl).toBeNull();
    expect(r1.legendEl).toBeNull();
    expect(r1.tooltipLegendEl).toBeNull();
    expect(r1.overlay).toHaveLength(1);

    const r2 = siftContainerChildren(null);
    expect(r2.titleEl).toBeNull();
    expect(r2.legendEl).toBeNull();
    expect(r2.tooltipLegendEl).toBeNull();
    expect(r2.overlay).toHaveLength(0);
  });

  it('passes unknown nodes through to overlay (nulls/false/strings land in overlay, harmless when rendered)', () => {
    const result = siftContainerChildren(kids(null, 'literal', <InfoBar />, false, <span id="x" />));
    expect(result.tooltipLegendEl).not.toBeNull();
    // Non-element values (null, 'literal', false) all flow to overlay; React
    // renders null/false/strings inertly so this is safe and we don't filter.
    expect(result.overlay).toHaveLength(4);
  });

  it('picks up the last Legend when multiple are passed (current contract)', () => {
    const result = siftContainerChildren(kids(<Legend position="bottom" />, <Legend position="right" />));
    expect(result.legendEl).not.toBeNull();
    const pos = (result.legendEl?.props as { position?: string } | undefined)?.position;
    expect(pos).toBe('right');
  });

  it('hoists Legend / InfoBar that are wrapped in a fragment', () => {
    // Common pattern: wrapping chart contents in a fragment when they come
    // from a helper component or conditional render. React passes the
    // fragment as one atomic child; siftContainerChildren must drill through
    // it so the hoisting still happens.
    const result = siftContainerChildren(
      <>
        <InfoBar />
        <span id="series-marker" />
        <Legend />
      </>,
    );
    expect(result.tooltipLegendEl).not.toBeNull();
    expect(result.legendEl).not.toBeNull();
    expect(result.overlay).toHaveLength(1);
  });

  it('drills through nested fragments', () => {
    const result = siftContainerChildren(
      <>
        <>
          <InfoBar />
        </>
        <span id="x" />
      </>,
    );
    expect(result.tooltipLegendEl).not.toBeNull();
    expect(result.overlay).toHaveLength(1);
  });

  it('leaves Legend inside a non-fragment component boundary untouched', () => {
    // A custom component that internally renders a Legend is its own DOM
    // subtree — hoisting it would break its encapsulation. Only direct
    // fragment unwrapping is transparent.
    function Inner() {
      return <Legend />;
    }
    const result = siftContainerChildren(kids(<Inner />, <span id="rest" />));
    expect(result.legendEl).toBeNull();
    expect(result.overlay).toHaveLength(2);
  });
});
