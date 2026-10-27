import type { ReactElement } from 'react';

import { act, render } from '@testing-library/react';
import { type ChartTheme, Sparkline, ThemeProvider, catppuccin } from '@wick-charts/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { flushAllRaf, installRaf, uninstallRaf } from '../helpers/raf';

/**
 * Sparkline composes its own ChartContainer internally, so these tests bypass
 * the `mountChart` helper (which wraps children in a fresh container) and use
 * plain RTL render against a sized host element.
 */
describe('Sparkline', () => {
  const data = [
    { time: 1, value: 10 },
    { time: 2, value: 14 },
    { time: 3, value: 12 },
    { time: 4, value: 18 },
    { time: 5, value: 16 },
  ];

  let host: HTMLElement;

  function mockSize(el: HTMLElement, width: number, height: number) {
    Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
    el.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: height,
        right: width,
        width,
        height,
        toJSON: () => ({}),
      }) as DOMRect;
  }

  beforeEach(() => {
    installRaf();
    host = document.createElement('div');
    mockSize(host, 200, 60);
    document.body.appendChild(host);

    // Sparkline renders inner divs with width/height styles, not flex sizing —
    // patch descendants so CanvasManager reads non-zero dimensions on mount.
    const origRect = HTMLDivElement.prototype.getBoundingClientRect;
    (host as HTMLElement & { __origRect?: typeof origRect }).__origRect = origRect;
    HTMLDivElement.prototype.getBoundingClientRect = function patched() {
      const r = origRect.call(this);
      if (r.width > 0 && r.height > 0) return r;
      if (host.contains(this)) {
        // Chart wrapper in Sparkline is { width: 140, height: 48 } by default.
        const w = 140;
        const h = 48;
        return { x: 0, y: 0, top: 0, left: 0, bottom: h, right: w, width: w, height: h, toJSON: () => ({}) } as DOMRect;
      }
      return r;
    };
  });

  afterEach(() => {
    const origRect = (host as HTMLElement & { __origRect?: () => DOMRect }).__origRect;
    if (origRect)
      HTMLDivElement.prototype.getBoundingClientRect =
        origRect as typeof HTMLDivElement.prototype.getBoundingClientRect;
    host.remove();
    uninstallRaf();
  });

  it('renders a canvas and records draw calls for line variant', () => {
    act(() => {
      render(<Sparkline data={data} theme={catppuccin.theme} />, { container: host });
    });
    act(() => flushAllRaf());

    const canvas = host.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas).not.toBeNull();
    // getContext('2d') installs the spy; mountChart does this eagerly but we're bypassing it.
    canvas.getContext('2d');
    const spy = canvas.__spy!;
    expect(spy).toBeDefined();
    // Line draws use beginPath + lineTo; zero-axis sparkline skips text calls.
    expect(spy.countOf('lineTo')).toBeGreaterThan(0);
    expect(spy.countOf('fillText')).toBe(0);
    expect(spy.countOf('strokeText')).toBe(0);
  });

  it('renders bar variant with one fill per bar', () => {
    act(() => {
      render(<Sparkline data={data} theme={catppuccin.theme} variant="bar" />, { container: host });
    });
    act(() => flushAllRaf());

    const canvas = host.querySelector('canvas') as HTMLCanvasElement;
    canvas.getContext('2d');
    const spy = canvas.__spy!;
    // Bars round their free end by default — a rounded bar paints a `fill`, a
    // sub-radius bar collapses to `fillRect`; count both so the assertion is
    // independent of which path each bar took.
    expect(spy.countOf('fill') + spy.countOf('fillRect')).toBeGreaterThanOrEqual(data.length);
  });

  it('draws a lone point as a dot', () => {
    act(() => {
      render(<Sparkline data={[{ time: Date.UTC(2026, 0, 1), value: 10 }]} theme={catppuccin.theme} />, {
        container: host,
      });
    });
    act(() => flushAllRaf());

    const canvas = host.querySelector('canvas') as HTMLCanvasElement;
    canvas.getContext('2d');

    expect(canvas.__spy?.countOf('arc')).toBeGreaterThan(0);
  });

  it('draws two points as a line, and as two bars inside the plot', () => {
    const two = [
      { time: Date.UTC(2026, 0, 1), value: 10 },
      { time: Date.UTC(2026, 0, 2), value: 12 },
    ];
    act(() => {
      render(<Sparkline data={two} theme={catppuccin.theme} />, { container: host });
    });
    act(() => flushAllRaf());

    const line = host.querySelector('canvas') as HTMLCanvasElement;
    line.getContext('2d');
    expect(line.__spy?.countOf('lineTo')).toBeGreaterThan(0);

    act(() => {
      render(<Sparkline data={two} theme={catppuccin.theme} variant="bar" />, { container: host });
    });
    act(() => flushAllRaf());

    const bars = host.querySelector('canvas') as HTMLCanvasElement;
    bars.getContext('2d');
    const rects = bars.__spy?.callsOf('fillRect').filter((call) => Number(call.args[2]) > 1) ?? [];
    const paths = bars.__spy?.countOf('fill') ?? 0;
    expect(rects.length + paths).toBeGreaterThanOrEqual(2);
    for (const call of rects) expect(Number(call.args[0])).toBeGreaterThanOrEqual(0);
  });

  it('applies custom color to the stroked line', () => {
    act(() => {
      render(<Sparkline data={data} theme={catppuccin.theme} color="#ff00aa" />, { container: host });
    });
    act(() => flushAllRaf());

    const canvas = host.querySelector('canvas') as HTMLCanvasElement;
    canvas.getContext('2d');
    const spy = canvas.__spy!;
    const strokes = spy.callsOf('stroke');
    expect(strokes.length).toBeGreaterThan(0);
    // At least one stroke carries the custom color (case-insensitive match).
    const matched = strokes.some((c) => c.strokeStyle.toLowerCase() === '#ff00aa');
    expect(matched).toBe(true);
  });

  it('renders value label when valuePosition is not "none"', () => {
    act(() => {
      render(<Sparkline data={data} theme={catppuccin.theme} label="BTC" valuePosition="right" />, { container: host });
    });
    act(() => flushAllRaf());

    // The label text is rendered in the DOM, not on the canvas.
    expect(host.textContent).toContain('BTC');
  });

  it('omits value block entirely when valuePosition="none"', () => {
    act(() => {
      render(<Sparkline data={data} theme={catppuccin.theme} label="BTC" valuePosition="none" />, { container: host });
    });
    act(() => flushAllRaf());

    expect(host.textContent).not.toContain('BTC');
  });

  it('format overrides the default value formatting', () => {
    act(() => {
      render(<Sparkline data={data} theme={catppuccin.theme} valuePosition="right" format={(v) => `$${v}!!`} />, {
        container: host,
      });
    });
    act(() => flushAllRaf());

    expect(host.textContent).toContain(`$${data[data.length - 1].value}!!`);
  });

  it('keeps the sign of the change when the series starts below zero', () => {
    const fromNegative = [
      { time: 1, value: -10 },
      { time: 2, value: -5 },
    ];

    act(() => {
      render(<Sparkline data={fromNegative} theme={catppuccin.theme} />, { container: host });
    });
    act(() => flushAllRaf());

    expect(host.textContent).toContain('+50.0%');
    expect(host.textContent).not.toContain('+-');
  });

  it('gives short value texts one column width, so the charts in a grid end on one line', () => {
    const { getByText } = render(
      <>
        <Sparkline data={data} theme={catppuccin.theme} label="Users" />
        <Sparkline data={data} theme={catppuccin.theme} label="api-prod-1" sublabel="99.9% uptime" />
      </>,
      { container: host },
    );

    const users = getByText('Users').parentElement as HTMLElement;
    const api = getByText('api-prod-1').parentElement as HTMLElement;

    expect(users.style.minWidth).not.toBe('0px');
    expect(users.style.minWidth).toBe(api.style.minWidth);
  });

  it('keeps the value column at its widest width, so a narrower value does not resize the chart', () => {
    // jsdom has no layout: give a text 10px per character.
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get(this: HTMLElement) {
        return (this.textContent?.length ?? 0) * 10;
      },
    });

    try {
      const wide = [
        { time: 1, value: 10 },
        { time: 2, value: -12345 },
      ];
      const narrow = [
        { time: 1, value: 10 },
        { time: 2, value: 11 },
      ];
      const { rerender, getByText } = render(<Sparkline data={wide} theme={catppuccin.theme} label="BTC" />, {
        container: host,
      });
      const valueColumn = getByText('BTC').parentElement as HTMLElement;
      const wideWidth = valueColumn.style.minWidth;

      rerender(<Sparkline data={narrow} theme={catppuccin.theme} label="BTC" />);

      expect(Number.parseFloat(wideWidth)).toBeGreaterThan(valueColumn.textContent.length * 10);
      expect(valueColumn.style.minWidth).toBe(wideWidth);
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', original);
    }
  });

  it('yRange clamps the vertical spread of the line', () => {
    function lineToYSpread(node: ReactElement): number {
      // Fresh child container per render — RTL caches one React root per
      // container, so reusing `host` across two renders would throw.
      const container = document.createElement('div');
      host.appendChild(container);
      act(() => {
        render(node, { container });
      });
      act(() => flushAllRaf());

      const canvas = container.querySelector('canvas') as HTMLCanvasElement;
      canvas.getContext('2d');
      const ys = canvas.__spy!.callsOf('lineTo').map((c) => c.args[1] as number);

      return Math.max(...ys) - Math.min(...ys);
    }

    // data spans 10..18; a wide fixed range (0..1000) squashes it into a thin
    // band near the baseline, so the drawn line's vertical spread shrinks well
    // below the auto-fit spread that stretches across the full plot height.
    const autoSpread = lineToYSpread(<Sparkline data={data} theme={catppuccin.theme} />);
    const clampedSpread = lineToYSpread(
      <Sparkline data={data} theme={catppuccin.theme} yRange={{ min: 0, max: 1000 }} />,
    );

    expect(clampedSpread).toBeLessThan(autoSpread);
  });

  it('releases the 240px ChartContainer height floor so the canvas fits the card', () => {
    act(() => {
      render(<Sparkline data={data} theme={catppuccin.theme} height={48} />, { container: host });
    });
    act(() => flushAllRaf());

    // ChartContainer defaults to `minHeight: 240px` (keeps a copy-pasted chart
    // in an unsized parent visible). Inside a 48px sparkline card that floor
    // made the canvas overflow the clipping wrapper, so only the top slice of
    // the chart was visible. Sparkline must override the floor on every
    // element between the canvas and its fixed-height wrapper.
    const canvas = host.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas).not.toBeNull();

    let el: HTMLElement | null = canvas.parentElement;
    while (el && el !== host) {
      expect(el.style.minHeight).not.toBe('240px');
      el = el.parentElement;
    }
  });

  it.each([undefined, 'right', 'left', 'offscreen'] as const)('flow mode renders for align=%s', (align) => {
    act(() => {
      render(<Sparkline data={data} theme={catppuccin.theme} flow={{ capacity: 10, align }} />, { container: host });
    });
    act(() => flushAllRaf());

    const canvas = host.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas).not.toBeNull();
    canvas.getContext('2d');
    // The seed line draws regardless of where the flow window anchors it.
    expect(canvas.__spy!.countOf('lineTo')).toBeGreaterThan(0);
  });

  function strokeColors(container: HTMLElement): string[] {
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    canvas.getContext('2d');
    const spy = canvas.__spy;
    if (!spy) throw new Error('canvas spy missing');

    return spy.callsOf('stroke').map((c) => c.strokeStyle.toLowerCase());
  }

  it('falls back to the default ChartContainer theme without a `theme` prop', () => {
    act(() => {
      render(<Sparkline data={data} />, { container: host });
    });
    act(() => flushAllRaf());

    expect(strokeColors(host)).toContain(catppuccin.theme.seriesColors[0].toLowerCase());
  });

  it('takes the ThemeProvider theme without a `theme` prop', () => {
    const provided: ChartTheme = { ...catppuccin.theme, seriesColors: ['#123456', ...catppuccin.theme.seriesColors] };
    act(() => {
      render(
        <ThemeProvider value={provided}>
          <Sparkline data={data} />
        </ThemeProvider>,
        { container: host },
      );
    });
    act(() => flushAllRaf());

    expect(strokeColors(host)).toContain('#123456');
  });
});
