'use client';

import { type RefObject, useCallback, useMemo, useSyncExternalStore } from 'react';

import { type ChartTheme, createTheme } from '@wick-charts/react';

/** CSS variables the theme is built from, read as raw computed strings. */
export interface WickThemeTokens {
  /** Painted backgrounds behind the chart, nearest first, up to the first opaque one. */
  surfaces: string[];
  /** `--background`: the base when every surface is translucent or none is painted. */
  background: string;
  foreground: string;
  mutedForeground: string;
  border: string;
  /** `--chart-1` … `--chart-5`, empty ones dropped. */
  chart: string[];
  fontFamily: string;
}

type Rgba = [number, number, number, number];

const CHART_TOKENS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'];
const OBSERVED_ATTRIBUTES = ['class', 'style', 'data-theme'];
const TRANSPARENT = /^transparent$|^rgba\(0, 0, 0, 0\)$|\/\s*0%?\s*\)$/;
// Computed colors spell out an alpha only below 1: `rgba(...)` or `... / a)`.
const TRANSLUCENT = /^rgba\(|\//;
const WHITE: Rgba = [255, 255, 255, 1];

let fallbackTheme: ChartTheme | null = null;
let probe: CanvasRenderingContext2D | null | undefined;

/**
 * A Wick Charts theme built from the shadcn/ui CSS variables. It follows
 * light/dark switches and token edits (`class`, `style`, `data-theme`) on the
 * chart's ancestors, `<html>` and `<body>` included.
 *
 * shadcn themes fill `--chart-1` … `--chart-5` with a ramp of one hue, light to
 * dark, in both modes. Series take the ramp in order. A single line, the heatmap
 * and "down" take the end of the ramp that stands out more on the card; "up"
 * takes `--chart-2`. Candles and order book sides stay in the theme's hue
 * instead of green / red.
 *
 * Pass the chart's wrapper `ref` to read the tokens where the chart is (a
 * scoped `.dark` subtree) and to match the card or panel behind it.
 */
export function useWickTheme(ref?: RefObject<HTMLElement | null>): ChartTheme {
  // React subscribes after the commit, when `ref.current` is set.
  const subscribe = useCallback((onChange: () => void) => subscribeTo(ref?.current ?? null, onChange), [ref]);
  const snapshot = useSyncExternalStore(
    subscribe,
    () => readSnapshot(ref?.current ?? null),
    () => '',
  );

  return useMemo(() => {
    if (snapshot === '') return getFallbackTheme();

    const tokens: WickThemeTokens = JSON.parse(snapshot);

    return themeFromTokens(tokens);
  }, [snapshot]);
}

export function themeFromTokens(tokens: WickThemeTokens): ChartTheme {
  const surface = flattenSurfaces(tokens);
  if (!surface) return getFallbackTheme();

  const foreground = parseColor(tokens.foreground);
  const muted = parseColor(tokens.mutedForeground);
  const border = parseColor(tokens.border);
  const chartColors = tokens.chart.map(parseColor).filter(isColor);
  const palette = chartColors.map((color) => formatColor(color));
  const background = formatColor(surface);
  const text = cssColor(foreground);
  const dim = cssColor(muted);

  // --chart-1 is the light end: it fades on a light card but stands out on a dark one.
  const strongIndex = strongerEnd(chartColors, surface);
  const strong = palette[strongIndex] ?? text;
  const softIndex = strongIndex === 1 ? 0 : 1;
  const soft = palette[softIndex] ?? dim;
  // The ramp is the same in both modes, so the card colour alone can sink into a mid-tone badge.
  const badgeText = readableOn(chartColors[softIndex] ?? muted, surface, foreground);

  return createTheme({
    name: 'shadcn',
    background,
    typography: { fontFamily: tokens.fontFamily || undefined },
    line: { color: strong },
    bar: { color: palette[0] },
    seriesColors: palette.length > 0 ? palette : undefined,
    candlestick: { up: { body: soft }, down: { body: strong } },
    yLabel: {
      upBackground: soft,
      downBackground: soft,
      neutralBackground: soft,
      textColor: badgeText,
    },
    grid: { color: cssColor(border, 0.5) },
    // shadcn chart ticks are `text-xs`.
    axis: { textColor: dim, fontSize: 12 },
    crosshair: {
      color: cssColor(muted, 0.5),
      labelBackground: text,
      labelTextColor: background,
    },
    tooltip: {
      background,
      textColor: text,
      borderColor: cssColor(border),
      // The default --chart-1 is a light grey: series-coloured values would be unreadable on a light card.
      valueColor: text,
    },
  }).theme;
}

function subscribeTo(element: HTMLElement | null, onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  const options = { attributes: true, attributeFilter: OBSERVED_ATTRIBUTES };
  // A `.dark` panel or token edits on any ancestor change what the chart reads, not only <html>.
  for (let node: Element | null = element ?? document.body; node; node = node.parentElement) {
    observer.observe(node, options);
  }

  const scheme = window.matchMedia('(prefers-color-scheme: dark)');
  scheme.addEventListener('change', onChange);

  return () => {
    observer.disconnect();
    scheme.removeEventListener('change', onChange);
  };
}

/** A string, so an unchanged theme compares equal and causes no update. */
function readSnapshot(element: HTMLElement | null): string {
  const target = element ?? document.body;
  const style = getComputedStyle(target);
  const token = (name: string) => style.getPropertyValue(name).trim();

  const tokens: WickThemeTokens = {
    surfaces: findSurfaces(target),
    background: token('--background'),
    foreground: token('--foreground'),
    mutedForeground: token('--muted-foreground'),
    border: token('--border'),
    chart: CHART_TOKENS.map(token).filter(Boolean),
    fontFamily: style.fontFamily,
  };

  return JSON.stringify(tokens);
}

function findSurfaces(element: Element): string[] {
  const surfaces: string[] = [];
  for (let node: Element | null = element; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor;
    if (TRANSPARENT.test(color)) continue;

    surfaces.push(color);
    if (!TRANSLUCENT.test(color)) break;
  }

  return surfaces;
}

/**
 * The opaque color the chart sits on, which createTheme derives every tint from: a
 * translucent card (`bg-card/50`) blended over what is behind it, down to `--background`.
 */
function flattenSurfaces(tokens: WickThemeTokens): Rgba | null {
  // Outermost first, so each nearer layer paints over the ones behind it.
  const layers = [tokens.background, ...[...tokens.surfaces].reverse()].map(parseColor).filter(isColor);
  if (layers.length === 0) return null;

  return layers.reduce(paintOver, WHITE);
}

function paintOver(below: Rgba, layer: Rgba): Rgba {
  const alpha = layer[3];
  const channel = (index: number) => Math.round(layer[index] * alpha + below[index] * (1 - alpha));

  return [channel(0), channel(1), channel(2), 1];
}

/**
 * Tokens are often `oklch()`; painting one pixel turns any CSS color into sRGB channels.
 * Tailwind 3 themes store bare HSL channels (`12 76% 61%`) and wrap them in `hsl()` at use.
 */
function parseColor(token: string): Rgba | null {
  if (token === '') return null;

  const color = CSS.supports('color', token) ? token : `hsl(${token})`;
  if (!CSS.supports('color', color)) return null;

  const context = getProbe();
  if (!context) return null;

  context.clearRect(0, 0, 1, 1);
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;

  return [r, g, b, a / 255];
}

function formatColor(color: Rgba, alpha = 1): string {
  const [r, g, b, a] = color;
  const opacity = Math.round(a * alpha * 1000) / 1000;
  if (opacity >= 1) return `#${toHex(r)}${toHex(g)}${toHex(b)}`;

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function cssColor(color: Rgba | null, alpha = 1): string | undefined {
  return color ? formatColor(color, alpha) : undefined;
}

function isColor(color: Rgba | null): color is Rgba {
  return color !== null;
}

/** Index of the first or the last colour, whichever contrasts more with `surface`; -1 when empty. */
function strongerEnd(colors: Rgba[], surface: Rgba): number {
  if (colors.length === 0) return -1;

  const last = colors.length - 1;
  const firstContrast = contrast(colors[0], surface);
  const lastContrast = contrast(colors[last], surface);

  return firstContrast >= lastContrast ? 0 : last;
}

/** `surface` or `foreground`, whichever contrasts more with `fill`. */
function readableOn(fill: Rgba | null, surface: Rgba, foreground: Rgba | null): string {
  if (!fill || !foreground) return formatColor(surface);

  const surfaceContrast = contrast(surface, fill);
  const foregroundContrast = contrast(foreground, fill);

  return formatColor(surfaceContrast >= foregroundContrast ? surface : foreground);
}

/** WCAG contrast ratio, 1 to 21. */
function contrast(a: Rgba, b: Rgba): number {
  const lighter = Math.max(luminance(a), luminance(b));
  const darker = Math.min(luminance(a), luminance(b));

  return (lighter + 0.05) / (darker + 0.05);
}

function luminance(color: Rgba): number {
  const [r, g, b] = color.slice(0, 3).map((channel) => {
    const value = channel / 255;

    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function toHex(channel: number): string {
  return channel.toString(16).padStart(2, '0');
}

function getProbe(): CanvasRenderingContext2D | null {
  if (probe !== undefined) return probe;

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  probe = canvas.getContext('2d', { willReadFrequently: true });

  return probe;
}

/** Used on the server and before the tokens can be read. */
function getFallbackTheme(): ChartTheme {
  if (!fallbackTheme) fallbackTheme = createTheme({ name: 'shadcn', background: '#ffffff' }).theme;

  return fallbackTheme;
}
