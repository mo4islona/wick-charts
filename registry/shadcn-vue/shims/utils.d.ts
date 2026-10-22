// Type stand-in for the shadcn-vue `cn` helper (clsx + tailwind-merge in the user's project).
import type { HTMLAttributes } from 'vue';

export declare function cn(...inputs: Array<HTMLAttributes['class']>): string;
