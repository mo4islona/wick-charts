import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Panel } from '../components/playground/Panel';
import { Toggle } from '../components/playground/primitives';
import type { RowSpec, SectionSpec } from '../components/playground/sections';

interface TestState {
  alpha: boolean;
  beta: boolean;
  gamma: boolean;
  delta: boolean;
}

const defaults: TestState = { alpha: true, beta: true, gamma: true, delta: true };

const toggleRender = (): RowSpec['render'] => (v, onChange) => (
  <Toggle checked={v as boolean} onChange={onChange as (v: boolean) => void} />
);

const sections: SectionSpec[] = [
  {
    id: 'grid',
    title: 'Grid',
    rows: [
      { key: 'alpha', label: 'Visible', hint: 'Toggle grid lines', render: toggleRender() },
      { key: 'beta', label: 'Density', hint: 'Tick density', render: toggleRender() },
    ],
  },
  {
    id: 'animations',
    title: 'Animations',
    rows: [
      { key: 'gamma', label: 'Entry fade', hint: 'Fade in', render: toggleRender() },
      { key: 'delta', label: 'Duration', render: toggleRender() },
    ],
  },
];

function fakeActiveCount() {
  return 0;
}

describe('Panel search filter', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows all rows with empty query', () => {
    render(
      <Panel<TestState>
        sections={sections}
        state={defaults}
        setMany={() => {}}
        reset={() => {}}
        activeCount={fakeActiveCount}
      />,
    );

    expect(screen.getByText('Visible')).toBeTruthy();
    expect(screen.getByText('Density')).toBeTruthy();
    expect(screen.getByText('Entry fade')).toBeTruthy();
    expect(screen.getByText('Duration')).toBeTruthy();
  });

  it('matches case-insensitively against label and hint', () => {
    render(
      <Panel<TestState>
        sections={sections}
        state={defaults}
        setMany={() => {}}
        reset={() => {}}
        activeCount={fakeActiveCount}
      />,
    );

    const input = screen.getByPlaceholderText('Search settings');
    fireEvent.change(input, { target: { value: 'TICK' } });

    expect(screen.queryByText('Visible')).toBeNull();
    expect(screen.getByText('Density')).toBeTruthy();
    expect(screen.queryByText('Entry fade')).toBeNull();
    expect(screen.queryByText('Duration')).toBeNull();
  });

  it('hides sections with zero visible rows', () => {
    render(
      <Panel<TestState>
        sections={sections}
        state={defaults}
        setMany={() => {}}
        reset={() => {}}
        activeCount={fakeActiveCount}
      />,
    );

    const input = screen.getByPlaceholderText('Search settings');
    fireEvent.change(input, { target: { value: 'entry' } });

    // Animations header should still render; Grid header should be gone.
    expect(screen.queryByText('Grid')).toBeNull();
    expect(screen.getByText('Animations')).toBeTruthy();
    expect(screen.getByText('Entry fade')).toBeTruthy();
  });

  it('matches against label body', () => {
    render(
      <Panel<TestState>
        sections={sections}
        state={defaults}
        setMany={() => {}}
        reset={() => {}}
        activeCount={fakeActiveCount}
      />,
    );

    const input = screen.getByPlaceholderText('Search settings');
    fireEvent.change(input, { target: { value: 'duration' } });

    expect(screen.getByText('Duration')).toBeTruthy();
    expect(screen.queryByText('Visible')).toBeNull();
    expect(screen.queryByText('Entry fade')).toBeNull();
  });
});
