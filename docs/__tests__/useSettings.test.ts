import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useSettings } from '../components/playground/useSettings';

interface TestState {
  a: boolean;
  b: number;
  c: string;
  d: boolean;
}

const DEFAULTS: TestState = { a: true, b: 5, c: 'x', d: false };

describe('useSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('round-trips state through localStorage under the namespaced key', async () => {
    const { result, unmount } = renderHook(() => useSettings<TestState>({ id: 'unit-test', defaults: DEFAULTS }));

    act(() => {
      result.current.setMany({ a: false, b: 99 });
    });

    // Debounced save — wait past 200ms window.
    await new Promise((r) => setTimeout(r, 250));

    const raw = localStorage.getItem('playground:unit-test');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.a).toBe(false);
    expect(parsed.b).toBe(99);

    unmount();

    const { result: next } = renderHook(() => useSettings<TestState>({ id: 'unit-test', defaults: DEFAULTS }));
    expect(next.current.state.a).toBe(false);
    expect(next.current.state.b).toBe(99);
  });

  it('reset(keys) restores only the named keys', () => {
    const { result } = renderHook(() => useSettings<TestState>({ id: 'reset-subset', defaults: DEFAULTS }));

    act(() => {
      result.current.setMany({ a: false, b: 99, c: 'y', d: true });
    });
    expect(result.current.state).toEqual({ a: false, b: 99, c: 'y', d: true });

    act(() => {
      result.current.reset(['a', 'b']);
    });

    expect(result.current.state.a).toBe(true);
    expect(result.current.state.b).toBe(5);
    expect(result.current.state.c).toBe('y');
    expect(result.current.state.d).toBe(true);
  });

  it('reset() removes only the namespaced playground key, never other keys', () => {
    localStorage.setItem('framework', 'react');
    localStorage.setItem('theme', 'dark');
    localStorage.setItem('sidebar', 'open');
    localStorage.setItem('playground:panel-width', '30');
    localStorage.setItem('playground:other', JSON.stringify({ foo: 1 }));

    const { result } = renderHook(() => useSettings<TestState>({ id: 'reset-all', defaults: DEFAULTS }));

    act(() => {
      result.current.setMany({ a: false });
    });

    act(() => {
      result.current.reset();
    });

    expect(localStorage.getItem('playground:reset-all')).toBeNull();
    expect(localStorage.getItem('framework')).toBe('react');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(localStorage.getItem('sidebar')).toBe('open');
    expect(localStorage.getItem('playground:panel-width')).toBe('30');
    expect(localStorage.getItem('playground:other')).toBe(JSON.stringify({ foo: 1 }));
    expect(result.current.state).toEqual(DEFAULTS);
  });

  it('activeCount compares by flat key against defaults', () => {
    const { result } = renderHook(() => useSettings<TestState>({ id: 'count', defaults: DEFAULTS }));

    expect(result.current.activeCount(['a', 'b', 'c', 'd'])).toBe(0);

    act(() => {
      result.current.setMany({ a: false, b: 99 });
    });

    expect(result.current.activeCount(['a', 'b', 'c', 'd'])).toBe(2);
    expect(result.current.activeCount(['a'])).toBe(1);
    expect(result.current.activeCount(['c', 'd'])).toBe(0);
  });
});
