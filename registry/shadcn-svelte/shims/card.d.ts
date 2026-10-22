// Type stand-ins for the shadcn-svelte card the blocks import; the user's project supplies the real one.
import type { Component, Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';

type CardPart = Component<HTMLAttributes<HTMLDivElement> & { children?: Snippet }>;

export declare const Root: CardPart;
export declare const Header: CardPart;
export declare const Title: CardPart;
export declare const Description: CardPart;
export declare const Action: CardPart;
export declare const Content: CardPart;
export declare const Footer: CardPart;
