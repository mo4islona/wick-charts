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

const REACT_LAZY = Symbol.for('react.lazy');

interface LazyType {
  $$typeof: symbol;
  _payload: unknown;
  _init: (payload: unknown) => unknown;
}

function isLazyType(type: unknown): type is LazyType {
  if (typeof type !== 'object' || type === null) return false;

  const candidate = type as Partial<LazyType>;

  return candidate.$$typeof === REACT_LAZY && typeof candidate._init === 'function';
}

/**
 * Read the slot marker off a React element's `type`, if any. A lazy type
 * (how the Flight client delivers a client component created by a Server
 * Component) is resolved first; a pending one throws its thenable, which
 * suspends the render exactly like React's own lazy handling.
 */
export function slotOf(type: unknown): WickSlot | undefined {
  let resolved = type;
  while (isLazyType(resolved)) {
    resolved = resolved._init(resolved._payload);
  }

  const taggable = typeof resolved === 'function' || (typeof resolved === 'object' && resolved !== null);
  if (!taggable) return undefined;

  return (resolved as Record<string, WickSlot | undefined>)[SLOT_KEY];
}
