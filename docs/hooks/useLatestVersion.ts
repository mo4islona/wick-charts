import { useEffect, useState } from 'react';

// In-memory cache so tab switches don't re-hit the registry.
const cache = new Map<string, string>();

const storageKey = (pkg: string) => `wick-charts:npm-version:${pkg}`;

function readCached(pkg: string): string | null {
  if (cache.has(pkg)) return cache.get(pkg) ?? null;
  if (typeof localStorage === 'undefined') return null;

  const stored = localStorage.getItem(storageKey(pkg));
  if (stored) cache.set(pkg, stored);

  return stored;
}

export function useLatestVersion(pkg: string): string | null {
  const [version, setVersion] = useState<string | null>(() => readCached(pkg));

  useEffect(() => {
    const controller = new AbortController();

    fetch(`https://registry.npmjs.org/${pkg}/latest`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { version?: string } | null) => {
        if (!data?.version) return;

        cache.set(pkg, data.version);
        try {
          localStorage.setItem(storageKey(pkg), data.version);
        } catch {
          // Private mode / storage disabled — cache stays in-memory only.
        }
        setVersion(data.version);
      })
      .catch(() => {
        // Network/abort errors leave the cached value (if any) in place.
      });

    return () => controller.abort();
  }, [pkg]);

  return version;
}
