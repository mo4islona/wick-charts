import { useState } from 'react';

import type { Framework } from '../context/framework';

const FW_STORAGE_KEY = 'wick-fw';

/** Root-level hook that owns the framework state + localStorage persistence. */
export function useFrameworkState(): [Framework, (v: Framework) => void] {
  const [fw, setFwRaw] = useState<Framework>(() => {
    try {
      const saved = localStorage.getItem(FW_STORAGE_KEY);
      if (saved === 'react' || saved === 'vue' || saved === 'svelte') return saved;
    } catch {}
    return 'react';
  });
  const setFw = (v: Framework) => {
    setFwRaw(v);
    try {
      localStorage.setItem(FW_STORAGE_KEY, v);
    } catch {}
  };
  return [fw, setFw];
}
