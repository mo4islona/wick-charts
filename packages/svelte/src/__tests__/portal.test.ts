import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { portal } from '../ui/portal';

/**
 * `portal` is a Svelte action used by the hoisted overlay components
 * (Title, TooltipLegend, Legend) to move their rendered output into the
 * anchor slots on `ChartContainer`. It must:
 *   - append the node into the given target when set;
 *   - restore the node to its original DOM position when the target clears
 *     (null) or the action is destroyed;
 *   - tolerate the original neighbour having been re-parented in the
 *     meantime (fallback to appendChild).
 */

describe('portal action', () => {
  let originalParent: HTMLElement;
  let sibling: HTMLElement;
  let node: HTMLElement;
  let target: HTMLElement;

  beforeEach(() => {
    originalParent = document.createElement('div');
    sibling = document.createElement('span');
    sibling.id = 'sibling';
    node = document.createElement('section');
    target = document.createElement('div');
    target.id = 'target';
    originalParent.appendChild(node);
    originalParent.appendChild(sibling);
    document.body.appendChild(originalParent);
    document.body.appendChild(target);
  });

  afterEach(() => {
    originalParent.remove();
    target.remove();
  });

  it('moves the node into the target when the action receives a non-null anchor', () => {
    const action = portal(node, target);
    expect(node.parentElement).toBe(target);
    action.destroy();
  });

  it('restores the node to its original position on destroy', () => {
    const action = portal(node, target);
    action.destroy();
    expect(node.parentElement).toBe(originalParent);
    // Original neighbour preserved — node sits before `sibling`, not after.
    expect(originalParent.children[0]).toBe(node);
    expect(originalParent.children[1]).toBe(sibling);
  });

  it('restores the node when the target is cleared to null mid-lifetime', () => {
    const action = portal(node, target);
    expect(node.parentElement).toBe(target);
    action.update(null);
    expect(node.parentElement).toBe(originalParent);
    action.destroy();
  });

  it('is a no-op when the target does not change', () => {
    const action = portal(node, target);
    const firstParent = node.parentElement;
    action.update(target);
    expect(node.parentElement).toBe(firstParent);
    action.destroy();
  });

  it('falls back to appendChild when the original neighbour was removed', () => {
    const action = portal(node, target);
    // Someone else removed the original sibling while the portal was active.
    sibling.remove();
    action.destroy();
    expect(node.parentElement).toBe(originalParent);
  });
});
