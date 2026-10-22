import { type ChartTheme, createTheme } from "@wick-charts/vue"
import {
  type MaybeRefOrGetter,
  type ShallowRef,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  toValue,
  watch,
} from "vue"

/** CSS variables the theme is built from, read as raw computed strings. */
export interface WickThemeTokens {
  /** Painted backgrounds behind the chart, nearest first, up to the first opaque one. */
  surfaces: string[]
  /** `--background`: the base when every surface is translucent or none is painted. */
  background: string
  foreground: string
  mutedForeground: string
  border: string
  /** `--chart-1` … `--chart-5`, empty ones dropped. */
  chart: string[]
  fontFamily: string
}

type Rgba = [number, number, number, number]

const CHART_TOKENS = [
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
]
const OBSERVED_ATTRIBUTES = ["class", "style", "data-theme"]
const TRANSPARENT = /^transparent$|^rgba\(0, 0, 0, 0\)$|\/\s*0%?\s*\)$/
// Computed colors spell out an alpha only below 1: `rgba(...)` or `... / a)`.
const TRANSLUCENT = /^rgba\(|\//
const WHITE: Rgba = [255, 255, 255, 1]
// A chart color under this contrast with the card fades into it, as the dark end of a ramp does on a dark card.
const MIN_SERIES_CONTRAST = 2
// Lifted colors spread up to this contrast, so they keep their order and stay apart.
const LIFT_BELOW = 3

let fallbackTheme: ChartTheme | null = null
let probe: CanvasRenderingContext2D | null | undefined

/**
 * A Wick Charts theme built from the shadcn-vue CSS variables. It follows
 * light/dark switches and token edits (`class`, `style`, `data-theme`) on the
 * chart's ancestors, `<html>` and `<body>` included.
 *
 * shadcn themes fill `--chart-1` … `--chart-5` with a ramp of one hue, light to
 * dark, in both modes. Series take the ramp in order. A single line, the heatmap
 * and "down" take the end of the ramp that stands out more on the card; "up"
 * takes `--chart-2`. Candles and order book sides stay in the theme's hue
 * instead of green / red.
 *
 * Pass the chart's wrapper element (a template ref) to read the tokens where the
 * chart is (a scoped `.dark` subtree) and to match the card or panel behind it.
 */
export function useWickTheme(
  target?: MaybeRefOrGetter<HTMLElement | null | undefined>
): Readonly<ShallowRef<ChartTheme>> {
  const theme = shallowRef(getFallbackTheme())
  let snapshot = ""
  let unsubscribe: (() => void) | null = null

  // The tokens exist only in the browser: the server and the first client render use the fallback.
  onMounted(() => {
    watch(
      () => toValue(target) ?? null,
      (element) => {
        unsubscribe?.()

        const refresh = () => {
          const next = readSnapshot(element)
          if (next === snapshot) return

          snapshot = next
          theme.value = themeFromTokens(JSON.parse(next))
        }

        unsubscribe = subscribeTo(element, refresh)
        refresh()
      },
      { immediate: true }
    )
  })

  onBeforeUnmount(() => unsubscribe?.())

  return theme
}

export function themeFromTokens(tokens: WickThemeTokens): ChartTheme {
  const surface = flattenSurfaces(tokens)
  if (!surface) return getFallbackTheme()

  const foreground = parseColor(tokens.foreground)
  const muted = parseColor(tokens.mutedForeground)
  const border = parseColor(tokens.border)
  const chartColors = liftWeakColors({
    colors: tokens.chart.map(parseColor).filter(isColor),
    surface,
    foreground,
  })
  const palette = chartColors.map((color) => formatColor(color))
  const background = formatColor(surface)
  const text = cssColor(foreground)
  const dim = cssColor(muted)

  // --chart-1 is the light end: it fades on a light card but stands out on a dark one.
  const strongIndex = strongerEnd(chartColors, surface)
  const strong = palette[strongIndex] ?? text
  const softIndex = strongIndex === 1 ? 0 : 1
  const soft = palette[softIndex] ?? dim
  // The ramp is the same in both modes, so the card colour alone can sink into a mid-tone badge.
  const badgeText = readableOn(
    chartColors[softIndex] ?? muted,
    surface,
    foreground
  )

  return createTheme({
    name: "shadcn",
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
  }).theme
}

function subscribeTo(
  element: HTMLElement | null,
  onChange: () => void
): () => void {
  const observer = new MutationObserver(onChange)
  const options = { attributes: true, attributeFilter: OBSERVED_ATTRIBUTES }
  // A `.dark` panel or token edits on any ancestor change what the chart reads, not only <html>.
  for (
    let node: Element | null = element ?? document.body;
    node;
    node = node.parentElement
  ) {
    observer.observe(node, options)
  }

  const scheme = window.matchMedia("(prefers-color-scheme: dark)")
  scheme.addEventListener("change", onChange)

  return () => {
    observer.disconnect()
    scheme.removeEventListener("change", onChange)
  }
}

/** A string, so an unchanged theme compares equal and causes no update. */
function readSnapshot(element: HTMLElement | null): string {
  const target = element ?? document.body
  const style = getComputedStyle(target)
  const token = (name: string) => style.getPropertyValue(name).trim()

  const tokens: WickThemeTokens = {
    surfaces: findSurfaces(target),
    background: token("--background"),
    foreground: token("--foreground"),
    mutedForeground: token("--muted-foreground"),
    border: token("--border"),
    chart: CHART_TOKENS.map(token).filter(Boolean),
    fontFamily: style.fontFamily,
  }

  return JSON.stringify(tokens)
}

function findSurfaces(element: Element): string[] {
  const surfaces: string[] = []
  for (let node: Element | null = element; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor
    if (TRANSPARENT.test(color)) continue

    surfaces.push(color)
    if (!TRANSLUCENT.test(color)) break
  }

  return surfaces
}

/**
 * The opaque color the chart sits on, which createTheme derives every tint from: a
 * translucent card (`bg-card/50`) blended over what is behind it, down to `--background`.
 */
function flattenSurfaces(tokens: WickThemeTokens): Rgba | null {
  // Outermost first, so each nearer layer paints over the ones behind it.
  const layers = [tokens.background, ...[...tokens.surfaces].reverse()]
    .map(parseColor)
    .filter(isColor)
  if (layers.length === 0) return null

  return layers.reduce(paintOver, WHITE)
}

function paintOver(below: Rgba, layer: Rgba): Rgba {
  const alpha = layer[3]
  const blend = (top: number, bottom: number) =>
    Math.round(top * alpha + bottom * (1 - alpha))

  return [
    blend(layer[0], below[0]),
    blend(layer[1], below[1]),
    blend(layer[2], below[2]),
    1,
  ]
}

/**
 * Tokens are often `oklch()`; painting one pixel turns any CSS color into sRGB channels.
 * Tailwind 3 themes store bare HSL channels (`12 76% 61%`) and wrap them in `hsl()` at use.
 */
function parseColor(token: string): Rgba | null {
  if (token === "") return null

  const color = CSS.supports("color", token) ? token : `hsl(${token})`
  if (!CSS.supports("color", color)) return null

  const context = getProbe()
  if (!context) return null

  context.clearRect(0, 0, 1, 1)
  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(0, 0, 1, 1).data

  return [r, g, b, a / 255]
}

function formatColor(color: Rgba, alpha = 1): string {
  const [r, g, b, a] = color
  const opacity = Math.round(a * alpha * 1000) / 1000
  if (opacity >= 1) return `#${toHex(r)}${toHex(g)}${toHex(b)}`

  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

function cssColor(color: Rgba | null, alpha = 1): string | undefined {
  return color ? formatColor(color, alpha) : undefined
}

function isColor(color: Rgba | null): color is Rgba {
  return color !== null
}

/**
 * Mixes the colors that sink into the card toward `foreground`: the weakest reaches
 * MIN_SERIES_CONTRAST, the others under LIFT_BELOW spread above it in their order.
 */
function liftWeakColors(args: {
  colors: Rgba[]
  surface: Rgba
  foreground: Rgba | null
}): Rgba[] {
  const { colors, surface, foreground } = args
  if (!foreground || colors.length === 0) return colors

  const weakest = Math.min(...colors.map((color) => contrast(color, surface)))
  if (weakest >= MIN_SERIES_CONTRAST) return colors

  return colors.map((color) => {
    const current = contrast(color, surface)
    if (current >= LIFT_BELOW) return color

    const share = (current - weakest) / (LIFT_BELOW - weakest)
    const target =
      MIN_SERIES_CONTRAST + share * (LIFT_BELOW - MIN_SERIES_CONTRAST)

    return mixToContrast({ color, toward: foreground, surface, target })
  })
}

/** `color` mixed toward `toward` in 2 % steps until its contrast with `surface` reaches `target`. */
function mixToContrast(args: {
  color: Rgba
  toward: Rgba
  surface: Rgba
  target: number
}): Rgba {
  for (let step = 1; step <= 50; step++) {
    const mixed = mix(args.color, args.toward, step / 50)
    if (contrast(mixed, args.surface) >= args.target) return mixed
  }

  return args.toward
}

function mix(from: Rgba, to: Rgba, amount: number): Rgba {
  const channel = (a: number, b: number) => Math.round(a + (b - a) * amount)

  return [
    channel(from[0], to[0]),
    channel(from[1], to[1]),
    channel(from[2], to[2]),
    from[3],
  ]
}

/** Index of the first or the last colour, whichever contrasts more with `surface`; -1 when empty. */
function strongerEnd(colors: Rgba[], surface: Rgba): number {
  const first = colors[0]
  const last = colors[colors.length - 1]
  if (!first || !last) return -1

  return contrast(first, surface) >= contrast(last, surface)
    ? 0
    : colors.length - 1
}

/** `surface` or `foreground`, whichever contrasts more with `fill`. */
function readableOn(
  fill: Rgba | null,
  surface: Rgba,
  foreground: Rgba | null
): string {
  if (!fill || !foreground) return formatColor(surface)

  const surfaceContrast = contrast(surface, fill)
  const foregroundContrast = contrast(foreground, fill)

  return formatColor(
    surfaceContrast >= foregroundContrast ? surface : foreground
  )
}

/** WCAG contrast ratio, 1 to 21. */
function contrast(a: Rgba, b: Rgba): number {
  const lighter = Math.max(luminance(a), luminance(b))
  const darker = Math.min(luminance(a), luminance(b))

  return (lighter + 0.05) / (darker + 0.05)
}

function luminance(color: Rgba): number {
  const linear = (channel: number) => {
    const value = channel / 255

    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }

  return (
    0.2126 * linear(color[0]) +
    0.7152 * linear(color[1]) +
    0.0722 * linear(color[2])
  )
}

function toHex(channel: number): string {
  return channel.toString(16).padStart(2, "0")
}

function getProbe(): CanvasRenderingContext2D | null {
  if (probe !== undefined) return probe

  const canvas = document.createElement("canvas")
  canvas.width = 1
  canvas.height = 1
  probe = canvas.getContext("2d", { willReadFrequently: true })

  return probe
}

/** Used on the server and before the tokens can be read. */
function getFallbackTheme(): ChartTheme {
  if (!fallbackTheme)
    fallbackTheme = createTheme({ name: "shadcn", background: "#ffffff" }).theme

  return fallbackTheme
}
