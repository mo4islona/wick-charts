import { createRequire } from 'node:module';

import { GlobalFonts } from '@napi-rs/canvas';

const require = createRequire(import.meta.url);

let bundledRegistered = false;

/**
 * Register Outfit, the font of the default themes, from the package itself:
 * a server with no fonts installed still draws text, and every host draws it the same.
 */
export function registerBundledFonts(): void {
  if (bundledRegistered) return;

  bundledRegistered = true;
  for (const weight of [400, 500, 600]) {
    const path = require.resolve(`@fontsource/outfit/files/outfit-latin-${weight}-normal.woff2`);
    GlobalFonts.registerFromPath(path, 'Outfit');
  }
}

/**
 * Make a font file (TTF, OTF, WOFF or WOFF2) available to charts, for a theme
 * whose `typography.fontFamily` names a font the host does not have.
 *
 * @returns `false` when the file is not a font.
 */
export function registerFont(params: { path: string; family?: string }): boolean {
  const key = GlobalFonts.registerFromPath(params.path, params.family);

  return key !== null;
}
