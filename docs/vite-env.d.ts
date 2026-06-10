/// <reference types="vite/client" />

interface Window {
  /** Production route list for the prerender crawler. Set in docs/main.tsx. */
  __WICK_ROUTES__?: string[];
  /** Canonical site origin for the prerender crawler. Set in docs/main.tsx. */
  __WICK_SITE_URL__?: string;
  /** Rendered llms.txt body for the prerender crawler. Set in docs/main.tsx. */
  __WICK_LLMS_TXT__?: string;
}
