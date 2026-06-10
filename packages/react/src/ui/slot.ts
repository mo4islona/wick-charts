/**
 * Layout-slot markers for `<ChartContainer>` child hoisting.
 *
 * `ChartContainer` needs to recognize `<Title>` / `<Legend>` / `<PieLegend>` /
 * `<InfoBar>` / `<Navigator>` children to position them outside the canvas
 * overlay. Matching by component identity (`child.type === Navigator`) would
 * force `ChartContainer` to import every one of those components — and
 * `Navigator` transitively retains the whole core navigator stack — so even a
 * minimal chart would bundle all of them. Instead each component carries a
 * static slot marker and the container matches on that.
 */

/** Slot names a `ChartContainer` child can claim. */
export type WickSlot = 'title' | 'legend' | 'pieLegend' | 'infoBar' | 'navigator';

const SLOT_KEY = '__wickSlot';

/** Tag a component (plain function or `memo` wrapper) as a layout slot. */
export function markSlot(component: object, slot: WickSlot): void {
  (component as Record<string, WickSlot>)[SLOT_KEY] = slot;
}

/** Read the slot marker off a React element's `type`, if any. */
export function slotOf(type: unknown): WickSlot | undefined {
  const taggable = typeof type === 'function' || (typeof type === 'object' && type !== null);
  if (!taggable) return undefined;

  return (type as Record<string, WickSlot | undefined>)[SLOT_KEY];
}
