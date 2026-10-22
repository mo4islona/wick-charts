// Type stand-in for the shadcn-svelte `cn` helper (clsx + tailwind-merge in the user's project).
type ClassDictionary = Record<string, unknown>;
type ClassValue = ClassValue[] | ClassDictionary | string | number | bigint | boolean | null | undefined;

export declare function cn(...inputs: ClassValue[]): string;
