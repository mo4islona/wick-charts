import type { AxisLabelCover, ChartInstance } from '@wick-charts/core';
import type { Directive } from 'vue';

const covers = new WeakMap<HTMLElement, AxisLabelCover>();

/**
 * `v-axis-label-cover="chart"`: the axis tick labels under the element hide while it shows.
 * `v-axis-label-cover.fit` also widens an `'auto'` axis column to hold the element.
 */
export const vAxisLabelCover: Directive<HTMLElement, ChartInstance, 'fit'> = {
  mounted(el, binding) {
    covers.set(el, binding.value.coverAxisLabels(el, { fitColumn: binding.modifiers.fit === true }));
  },
  // A re-render can move the element and keep the same node.
  updated(el) {
    covers.get(el)?.update();
  },
  beforeUnmount(el) {
    covers.get(el)?.remove();
    covers.delete(el);
  },
};
