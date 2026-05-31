// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runWhileVisible } from '../hooks';

// `document.visibilityState` is a read-only getter on the prototype; override
// it on the instance so a test can drive the tab between foreground/background,
// then fire the event the real browser would.
function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

function fakeStream() {
  return { start: vi.fn(), stop: vi.fn() };
}

describe('runWhileVisible', () => {
  beforeEach(() => {
    setVisibility('visible');
  });

  afterEach(() => {
    setVisibility('visible');
  });

  it('starts streams immediately when mounted on a visible tab', () => {
    const a = fakeStream();
    const stop = runWhileVisible([a]);

    expect(a.start).toHaveBeenCalledTimes(1);
    expect(a.stop).not.toHaveBeenCalled();

    stop();
  });

  it('stops streams when the tab is hidden and restarts when it returns', () => {
    const a = fakeStream();
    const stop = runWhileVisible([a]);
    a.start.mockClear();

    setVisibility('hidden');
    expect(a.stop).toHaveBeenCalledTimes(1);
    expect(a.start).not.toHaveBeenCalled();

    setVisibility('visible');
    expect(a.start).toHaveBeenCalledTimes(1);

    stop();
  });

  it('does not start while hidden — kills background generation at the source', () => {
    setVisibility('hidden');
    const a = fakeStream();
    const stop = runWhileVisible([a]);

    expect(a.start).not.toHaveBeenCalled();
    expect(a.stop).toHaveBeenCalledTimes(1);

    stop();
  });

  it('drives every stream in the group together', () => {
    const a = fakeStream();
    const b = fakeStream();
    const stop = runWhileVisible([a, b]);

    setVisibility('hidden');
    expect(a.stop).toHaveBeenCalledTimes(1);
    expect(b.stop).toHaveBeenCalledTimes(1);

    stop();
  });

  it('cleanup detaches the listener so later visibility changes are ignored', () => {
    const a = fakeStream();
    const stop = runWhileVisible([a]);

    stop();
    expect(a.stop).toHaveBeenCalled();

    a.start.mockClear();
    a.stop.mockClear();

    setVisibility('hidden');
    setVisibility('visible');
    expect(a.start).not.toHaveBeenCalled();
    expect(a.stop).not.toHaveBeenCalled();
  });
});
