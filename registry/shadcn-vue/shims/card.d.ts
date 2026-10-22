// Type stand-ins for the shadcn-vue card the blocks import; the user's project supplies the real one.
import type { DefineComponent, HTMLAttributes } from 'vue';

type CardPart = DefineComponent<{ class?: HTMLAttributes['class'] }>;

export declare const Card: CardPart;
export declare const CardHeader: CardPart;
export declare const CardTitle: CardPart;
export declare const CardDescription: CardPart;
export declare const CardAction: CardPart;
export declare const CardContent: CardPart;
export declare const CardFooter: CardPart;
