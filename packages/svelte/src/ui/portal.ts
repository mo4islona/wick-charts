/**
 * Svelte action that moves the bound element into the given target as soon
 * as the target is available, and restores it to its original DOM position
 * when the target is cleared (or on destroy). Used by hoisted overlays
 * (Title, InfoBar, Legend) to render into the anchor slots provided
 * by ChartContainer — similar in spirit to Vue's `<Teleport>`.
 */
export function portal(node: HTMLElement, target: HTMLElement | null | undefined) {
  const originalParent = node.parentNode;
  const originalNextSibling = node.nextSibling;
  let current: HTMLElement | null = null;

  const restore = () => {
    current = null;
    if (!originalParent) return;
    // Re-insert at the original position. If the original neighbour moved
    // or was removed, fall back to appending.
    if (originalNextSibling?.parentNode === originalParent) {
      originalParent.insertBefore(node, originalNextSibling);
    } else if (node.parentNode !== originalParent) {
      originalParent.appendChild(node);
    }
  };

  const move = (to: HTMLElement | null | undefined) => {
    if (current === to) return;
    if (!to) {
      restore();
      return;
    }
    current = to;
    to.appendChild(node);
  };

  move(target);
  return {
    update(newTarget: HTMLElement | null | undefined) {
      move(newTarget);
    },
    destroy() {
      restore();
    },
  };
}
