# Animations

`<ChartContainer animations={…}>` takes one `AnimationsConfig` with three groups: the axes, the series and the visibility toggle. Every field, its default and what it tunes: `AnimationsConfig` in the installed types ([how to read them](SKILL.md#props-and-options-read-the-installed-types)).

```ts
import { type AnimationsConfig, hermite, spring } from '@wick-charts/react';

// The type keeps each curve's value type; without it, `x.curve` fails to type-check.
const ANIMATIONS: AnimationsConfig = {
  axis: {
    y: { curve: hermite(), settle: 250, sticky: { min: 500, max: 2500 }, gesture: 100 },
    x: { curve: spring(), settle: 200, gesture: 150 },
    ticks: 250,
  },
  series: {
    line: { entry: 250, smooth: 250, pulse: 600 },
    candlestick: { entry: 250, smooth: 250 },
    bar: { entry: 250, smooth: 250 },
    pie: { entry: 600, update: 250 },
  },
  toggle: 250,
};

<ChartContainer animations={ANIMATIONS}>
```

- **Off:** any group takes `false` — `animations={false}` (the whole chart), `{ axis: false }`, `{ series: { line: false } }`.
- **Changes:** the chart reads `animations` when it is built. A new value with the same content does nothing; a real change rebuilds the chart.
- **Curves:** `hermite()`, `spring()` and `snap()` are factories. Call them once (module scope, `useMemo`, `computed`), not on each render.
- **Per series:** a series' `entryMs`, `smoothMs`, `introMs` (and `pulseMs` on a line) set the duration for that one series; the chart-level values are the defaults for the rest. A chart-level `false` turns the animation off for every series of that type.

## Intro and entry styles

- `entryAnimation` is the style for points that arrive later (a string; the options type lists the values).
- `introAnimation` is the style of the first reveal, when the data first arrives. It takes a factory call:
  - line and band: `unfoldIntro()` (default), `sweepIntro()`, `traceIntro()`, `centerOutIntro()`, `plotterIntro()`;
  - bar: `growIntro()` (default), `springIntro()`;
  - candlestick: `candleUnfoldIntro()` (default), `wickBodyIntro()`;
  - bar and candlestick also take `fadeIntro()`, `riseIntro()`, `wipeIntro()`.
- `historyReveal` is the style for older points that are prepended ([realtime.md](realtime.md#history-on-scroll)); `'none'` shows them at once.
- An intro is a plain function of the frame, so you can write your own (`LineIntroFn`, `BarIntroFn`, `CandleIntroFn`). The docs guide `https://wick-charts.eeff.io/use-cases/custom-intro/` shows how.
