# Themes

A theme preset is a named export: `{ name, theme, dark, fontUrl, backgroundImage?, backgroundSize? }`. Pass its `.theme` to `ChartContainer`:

```tsx
import { ChartContainer, githubLight } from '@wick-charts/react';

<ChartContainer theme={githubLight.theme}>
```

- **Dark:** `catppuccin` (the default), `dracula`, `oneDarkPro`, `monokaiPro`, `nightOwl`, `materialPalenight`, `gruvbox`, `ayuMirage`, `panda`, `andromeda`, `highContrast`.
- **Light:** `githubLight`, `solarizedLight`, `rosePineDawn`, `quietLight`, `lavenderMist`, `mintBreeze`, `sandDune`, `peachCream`, `minimalLight`, `lightPink`, `handwritten`.

Choose by the page: the default is dark, so a light page needs a light theme. `preset.dark` tells which kind a preset is. `preset.fontUrl` is a font stylesheet that the preset's font needs (`null` for none); the chart does not load it, so add it to the page when you use that preset.

## A custom theme

`createTheme` derives every color from a few inputs and returns a preset:

```ts
import { createTheme } from '@wick-charts/react';

const brand = createTheme({
  background: '#0f172a', // the only required field
  candlestick: {
    up: { body: '#10b981' }, // or `body: autoGradient('#10b981')` for a soft vertical gradient
    down: { body: '#ef4444' },
  },
  seriesColors: ['#3b82f6', '#8b5cf6', '#ec4899'],
});

<ChartContainer theme={brand.theme}>
```

Every input field: `ThemeConfig` in the installed types ([how to read them](SKILL.md#props-and-options-read-the-installed-types)); every theme field: `ChartTheme`. The docs site has a visual editor: `https://wick-charts.eeff.io/use-cases/theme/`.

- `seriesColors` colors the layers of multi-layer series and further series, in order.
- `theme.tooltip.valueColor` paints the tooltip values in one color instead of each series color — use it when a series color is too faint on the tooltip background. The swatch keeps the series color.
- `chart.setTheme(theme)` and a new `theme` prop apply at runtime.
- React: `<ThemeProvider value={theme}>` gives one theme to every chart inside it.
- In a shadcn project the `useWickTheme` hook builds the theme from the CSS variables and follows light / dark: [shadcn.md](shadcn.md).
