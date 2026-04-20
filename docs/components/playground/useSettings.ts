import { useCallback, useEffect, useRef, useState } from 'react';

const PANEL_KEY = 'playground:panel-width';
const CODE_HEIGHT_KEY = 'playground:code-height';

export interface UseSettingsOpts<T extends object> {
  id: string;
  defaults: T;
}

export interface UseSettingsReturn<T extends object> {
  defaults: T;
  state: T;
  setMany: (patch: Partial<T>) => void;
  /** Reset the named flat keys to their defaults. Omit to reset everything. */
  reset: (keys?: (keyof T)[]) => void;
  /** Count of flat keys whose current value differs from its default. */
  activeCount: (keys: (keyof T)[]) => number;
}

function loadState<T extends object>(id: string, defaults: T): T {
  try {
    const raw = localStorage.getItem(`playground:${id}`);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {
    // ignore — localStorage may be unavailable
  }
  return defaults;
}

function saveState<T>(id: string, state: T) {
  try {
    localStorage.setItem(`playground:${id}`, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function useSettings<T extends object>({ id, defaults }: UseSettingsOpts<T>): UseSettingsReturn<T> {
  const [state, setState] = useState<T>(() => loadState(id, defaults));
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const setMany = useCallback(
    (patch: Partial<T>) => {
      setState((prev) => {
        const next = { ...prev, ...patch };
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => saveState(id, next), 200);
        return next;
      });
    },
    [id],
  );

  const reset = useCallback(
    (keys?: (keyof T)[]) => {
      if (keys && keys.length > 0) {
        const patch: Partial<T> = {};
        for (const k of keys) patch[k] = defaults[k];
        setMany(patch);
        return;
      }

      setState(defaults);
      // Namespaced removal — never .clear().
      try {
        localStorage.removeItem(`playground:${id}`);
      } catch {
        // ignore
      }
    },
    [defaults, id, setMany],
  );

  const activeCount = useCallback(
    (keys: (keyof T)[]) => {
      const s = state as Record<keyof T, unknown>;
      const d = defaults as Record<keyof T, unknown>;

      return keys.filter((k) => s[k] !== d[k]).length;
    },
    [state, defaults],
  );

  return { defaults, state, setMany, reset, activeCount };
}

// ── Panel width persistence (orthogonal to settings) ─────────

const DEFAULT_PANEL_PCT = 28;
const MIN_PANEL_PCT = 15;
const MAX_PANEL_PCT = 50;

export function usePanelWidth() {
  const [pct, setPct] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(PANEL_KEY);
      if (saved) return Math.max(MIN_PANEL_PCT, Math.min(MAX_PANEL_PCT, Number(saved)));
    } catch {
      // ignore
    }
    return DEFAULT_PANEL_PCT;
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const next = ((rect.right - ev.clientX) / rect.width) * 100;
      const clamped = Math.max(MIN_PANEL_PCT, Math.min(MAX_PANEL_PCT, next));
      setPct(clamped);
    };

    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      setPct((cur) => {
        try {
          localStorage.setItem(PANEL_KEY, String(Math.round(cur)));
        } catch {
          // ignore
        }
        return cur;
      });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  return { pct, containerRef, onMouseDown };
}

// ── Code-panel height persistence ────────────────────────────

const DEFAULT_CODE_PCT = 44;
const MIN_CODE_PCT = 15;
const MAX_CODE_PCT = 75;

export function useCodeHeight() {
  const [pct, setPct] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(CODE_HEIGHT_KEY);
      if (saved) return Math.max(MIN_CODE_PCT, Math.min(MAX_CODE_PCT, Number(saved)));
    } catch {
      // ignore
    }
    return DEFAULT_CODE_PCT;
  });

  const rightRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current || !rightRef.current) return;

      const rect = rightRef.current.getBoundingClientRect();
      const next = ((rect.bottom - ev.clientY) / rect.height) * 100;
      const clamped = Math.max(MIN_CODE_PCT, Math.min(MAX_CODE_PCT, next));
      setPct(clamped);
    };

    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      setPct((cur) => {
        try {
          localStorage.setItem(CODE_HEIGHT_KEY, String(Math.round(cur)));
        } catch {
          // ignore
        }
        return cur;
      });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  return { pct, rightRef, onMouseDown };
}
