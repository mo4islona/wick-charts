import { afterEach, describe, expect, it } from 'vitest';

import { ChartInstance } from '../chart';
import { createTheme, resolveTheme } from '../theme/create';
import { dracula } from '../theme/themes/dracula';
import { githubLight } from '../theme/themes/github-light';

const charts: ChartInstance[] = [];

function makeChart(options: ConstructorParameters<typeof ChartInstance>[1]): ChartInstance {
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
  document.body.appendChild(container);

  const chart = new ChartInstance(container, { interactive: false, ...options });
  charts.push(chart);

  return chart;
}

afterEach(() => {
  for (const chart of charts.splice(0)) {
    chart.destroy();
  }
  document.body.innerHTML = '';
});

describe('theme input: a preset or its .theme', () => {
  it('resolveTheme unwraps a preset and keeps a theme as it is', () => {
    expect(resolveTheme(githubLight)).toBe(githubLight.theme);
    expect(resolveTheme(githubLight.theme)).toBe(githubLight.theme);
  });

  it('resolveTheme keeps a plain theme that carries extra theme and dark keys', () => {
    const tagged = { ...githubLight.theme, dark: false, theme: 'light' };

    expect(resolveTheme(tagged)).toBe(tagged);
  });

  it('resolveTheme unwraps the preset that createTheme returns', () => {
    const brand = createTheme({ background: '#0f172a' });

    expect(resolveTheme(brand)).toBe(brand.theme);
  });

  it('the constructor takes a preset', () => {
    const chart = makeChart({ theme: githubLight });

    expect(chart.getTheme()).toBe(githubLight.theme);
  });

  it('setTheme takes a preset and a theme', () => {
    const chart = makeChart({ theme: githubLight.theme });

    chart.setTheme(dracula);
    expect(chart.getTheme()).toBe(dracula.theme);

    chart.setTheme(githubLight.theme);
    expect(chart.getTheme()).toBe(githubLight.theme);
  });
});
