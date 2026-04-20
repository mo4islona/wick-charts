/**
 * Canonical legend item — the unit every framework Legend passes to its
 * scoped slot (and the shape the built-in default UI consumes).
 *
 * Each item is **self-contained**: it carries its own identity and
 * pre-bound `toggle` / `isolate` closures, so slot code can freely sort,
 * filter, or remap items without risking a click on one row mutating the
 * wrong series.
 *
 * - `id` — row key for list rendering (React `key`, Vue `:key`,
 *   Svelte `each … (key)`). Guaranteed unique within the array.
 * - `seriesId` — owning series id, **never includes a layer suffix**.
 *   Use this for filtering/grouping; not unique across multi-layer rows.
 * - `layerIndex` — layer within a multi-layer series; `undefined` for
 *   single-layer rows.
 * - `isDisabled` — current toggled-off state, derived from
 *   `isSeriesVisible` / `isLayerVisible` plus local isolate-state in the
 *   Legend component.
 */
export interface LegendItem {
  readonly id: string;
  readonly seriesId: string;
  readonly layerIndex?: number;
  readonly label: string;
  readonly color: string;
  readonly isDisabled: boolean;
  /** Toggle just this item's visibility. */
  readonly toggle: () => void;
  /** Show only this item; calling again reveals everything (isolate/unisolate). */
  readonly isolate: () => void;
}
