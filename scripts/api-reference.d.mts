export interface ManifestProp {
  name: string;
  type: string;
  optional: boolean;
  defaultValue: string | null;
  deprecated: string | null;
  description: string;
  nested?: { name: string; props: ManifestProp[] };
}

export interface ManifestComponent {
  alias: string | null;
  description: string;
  props: ManifestProp[];
}

/** Markdown API reference for llms-full.txt, built from docs/data/api-manifest.json. */
export function buildApiReference(manifest: { components: Record<string, ManifestComponent> }): string;
