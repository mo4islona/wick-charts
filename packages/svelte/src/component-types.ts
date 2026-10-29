// Types the emitted `*.svelte.d.ts` files use after `scripts/component-types.mjs` rewrites them.
// Nothing here may need Svelte 5: the package also supports Svelte 4, which has no `Snippet` or `Component`.

import type { ComponentConstructorOptions, SvelteComponent } from 'svelte';

/** The value `{@render}` requires a snippet to return: read off Svelte 5's `createRawSnippet`, `unknown` on Svelte 4. */
type SnippetReturn = typeof import('svelte') extends {
  createRawSnippet: (...args: never) => (...args: never) => infer R;
}
  ? R
  : unknown;

/** Svelte 5's `Snippet<Args>`, built structurally so the declarations load on Svelte 4 too. */
export type SnippetProp<Args extends unknown[]> = (this: void, ...args: Args) => SnippetReturn;

/** The prop a Svelte 5 snippet fills a slot through: `children` for the default slot. */
type SnippetName<Slot> = Slot extends 'default' ? 'children' : Slot;

/** The slot a snippet prop fills. */
type SlotName<Prop> = Prop extends 'children' ? 'default' : Prop;

/** A slot's props become the snippet's single argument; a slot without props takes none. */
type SlotSnippet<SlotProps> = SnippetProp<keyof SlotProps extends never ? [] : [SlotProps]>;

/**
 * `Props` plus a typed snippet prop per slot, so `{#snippet children(ctx)}`
 * type-checks on Svelte 5. A prop named like a slot (`<Title sub>`) takes either
 * form; the `children` prop the components declare as `unknown` takes the snippet type.
 */
export type WithSnippets<Props, Slots> = keyof Slots extends never
  ? Props
  : {
      [P in keyof Props as P extends 'children' ? never : P]: SlotName<P> extends keyof Slots
        ? Props[P] | SlotSnippet<Slots[SlotName<P>]>
        : Props[P];
    } & {
      [S in keyof Slots as SnippetName<S> extends Exclude<keyof Props, 'children'>
        ? never
        : SnippetName<S>]?: SlotSnippet<Slots[S]>;
    };

/**
 * A component both majors accept: Svelte 4 constructs it as a class, Svelte 5
 * calls it, so it is assignable to `Component<Props>` and `ComponentProps<typeof X>` works.
 */
export interface IsomorphicComponent<
  Props extends Record<string, unknown>,
  Events extends Record<string, unknown>,
  Slots extends Record<string, unknown>,
> {
  new (options: ComponentConstructorOptions<Props>): SvelteComponent<Props, Events, Slots>;
  (internal: unknown, props: Props): Record<string, never>;
}
