// The prompts of the agent-success eval. Each prompt is what a user types into a coding agent,
// in a fresh Vite app of that framework. `criteria` is what a reviewer checks in the result,
// beyond "it builds and draws a chart without errors".
//
// `scenario` groups the same task across frameworks: a scenario that passes in React and fails
// in Vue points at the Vue wrapper or the Vue part of the skill.

/** @typedef {'react' | 'vue' | 'svelte'} Framework */
/** @typedef {{ id: string, scenario: string, framework: Framework, prompt: string, criteria: string[], network?: boolean }} Case */

const parity = [
  {
    scenario: 'live-btc',
    network: true,
    prompt:
      'Make a live BTC/USDT 1-minute candlestick chart with volume. Stream new candles from the Binance websocket, and load older candles from the Binance REST API when I scroll to the left edge.',
    criteria: [
      'Uses CandlestickSeries with OHLC points whose time is in epoch milliseconds (Binance kline open time), not seconds.',
      'Shows volume: either the volume field of the candles or a separate volume series/pane.',
      'Opens a Binance kline websocket and updates the last candle while it is open and appends a new one when it closes.',
      'Loads older candles from the Binance REST klines endpoint when the view reaches the left edge (EdgeLoader in React, onEdgeReached elsewhere) and prepends them.',
      'Closes the websocket when the component unmounts.',
    ],
  },
  {
    scenario: 'light-dashboard',
    prompt:
      'On our white admin page, add a line chart that compares revenue and costs per day over the last 90 days. Use made-up data. I need a tooltip and a legend that names the two lines.',
    criteria: [
      'Uses a light theme (the page is white), not the default dark theme.',
      'Two named lines, Revenue and Costs, with the names in the data (label), not in an unsupported prop.',
      'Has a tooltip and a legend.',
      'Times are epoch milliseconds or Date objects for the last 90 days.',
    ],
  },
  {
    scenario: 'stacked-traffic',
    prompt:
      'Show website traffic by source (organic, paid, referral) as a stacked area chart, hourly for the last 7 days with fake data. Clicking a source in the legend should hide it.',
    criteria: [
      'Three area layers stacked (stacking option), not three overlapping lines.',
      'Hourly points over 7 days, time in epoch milliseconds or Date.',
      'A legend whose items toggle the visibility of a layer.',
    ],
  },
  {
    scenario: 'donut-share',
    prompt:
      'I need a donut chart of browser market share (Chrome, Safari, Edge, Firefox, Other) with the legend under it and the total in the middle.',
    criteria: [
      'Uses PieSeries as a donut (inner radius), with five slices.',
      'Uses PieLegend (or an equivalent legend) placed below the chart.',
      'Shows the total in the center of the donut.',
      'Does not use Tooltip/Crosshair/axes that do not apply to a pie.',
    ],
  },
  {
    scenario: 'order-book',
    network: true,
    prompt: 'Add a live order book depth chart for BTCUSDT, fed from the Binance partial book depth websocket stream.',
    criteria: [
      'Uses DepthSeries with bids and asks as [price, size] pairs (numbers, not strings).',
      'Subscribes to a Binance depth websocket stream and updates the chart on each message.',
      'Closes the websocket when the component unmounts.',
    ],
  },
  {
    scenario: 'cpu-grid',
    prompt:
      'Make a grid of 6 small charts, each 80px tall, one per server, showing CPU % over the last 60 seconds. Fake the data and add a new point every second.',
    criteria: [
      'Six charts, each 80px tall: the chart container lets a height under 240px win (minHeight 0 or an equivalent).',
      'A new point every second through a new array (rolling window), not an in-place push.',
      'Clears the interval on unmount.',
    ],
  },
];

const single = [
  {
    framework: 'react',
    scenario: 'ticker-sparklines',
    prompt:
      'Add a watchlist table with 8 stock tickers. Each row shows the ticker, the last price, the day change in % and a small sparkline of the day. Fake the data.',
    criteria: [
      'Each row has a small inline chart (Sparkline or a small ChartContainer) that is visible: it has a width and a height.',
      'Eight rows with ticker, price and change %.',
    ],
  },
  {
    framework: 'react',
    scenario: 'budget-sankey',
    prompt:
      'Show how our yearly budget flows: income from Product, Services and Grants goes into Engineering, Sales, Marketing and Operations, and Engineering splits into Salaries and Cloud. Use a sankey chart.',
    criteria: [
      'Uses SankeySeries with nodes and links (not data).',
      'The flows match the described graph and balance.',
      'Uses SankeyTooltip or no tooltip, not the time-series Tooltip.',
    ],
  },
  {
    framework: 'react',
    scenario: 'bollinger',
    prompt:
      'Daily candlestick chart for a stock over one year with fake data, with 20-day Bollinger bands drawn over the price.',
    criteria: [
      'CandlestickSeries with daily candles over about a year.',
      'Bollinger bands as a BandSeries (or lines) computed from a 20-day mean and 2 standard deviations.',
      'The band is drawn on the same price scale as the candles.',
    ],
  },
  {
    framework: 'react',
    scenario: 'trade-markers',
    prompt:
      'Price line chart of ETH over the last day (fake 5-minute data). Mark my buys with green up arrows and my sells with red down arrows, and draw a dashed horizontal line at my entry price of 3150.',
    criteria: [
      'A line series of 5-minute points over one day.',
      'Buy and sell markers attached to the series (Marker or the markers API), green up and red down.',
      'A dashed reference line at 3150.',
    ],
  },
  {
    framework: 'vue',
    scenario: 'activity-heatmap',
    prompt:
      'Heatmap of user activity by weekday (Mon–Sun) and hour of day (0–23). Fake the counts and show the count on hover.',
    criteria: [
      'Uses HeatmapSeries with {x, y, value} cells, 7 × 24.',
      'Uses HeatmapTooltip (not the time-series Tooltip) to show the count.',
    ],
  },
  {
    framework: 'vue',
    scenario: 'cpu-gauge',
    prompt:
      'A gauge for CPU usage, 0–100%, with green up to 60, yellow up to 85 and red above. Update it every 2 seconds with a random value.',
    criteria: [
      'Uses GaugeSeries with a numeric value prop.',
      'Three zones at 0–60, 60–85 and 85–100 with green, yellow and red.',
      'Updates every 2 seconds and clears the timer on unmount.',
    ],
  },
  {
    framework: 'vue',
    scenario: 'log-scale',
    prompt:
      'Chart the Bitcoin price from 2011 to today on a log scale. A rough monthly series that you generate in code is fine.',
    criteria: [
      'Y axis uses a log scale (logScale mapping) created once, not on each render.',
      'Monthly points from 2011, time in epoch milliseconds or Date.',
    ],
  },
  {
    framework: 'vue',
    scenario: 'price-rsi-sync',
    prompt:
      'Two charts stacked vertically: price candles on top and RSI(14) under it. Panning, zooming and the crosshair must stay in sync between them. Fake hourly data.',
    criteria: [
      'Two ChartContainers: candles on top, an RSI line under it, RSI computed with period 14.',
      'The visible range and the crosshair are linked in both directions (chart instances via onReady/ready, viewportChange and crosshairMove), with a guard against loops.',
    ],
  },
  {
    framework: 'svelte',
    scenario: 'latency-histogram',
    prompt:
      'Histogram of API response times from 2000 fake samples (log-normal-ish), with vertical lines at p50 and p95.',
    criteria: [
      'Uses HistogramSeries with raw samples or bins.',
      'Marks p50 and p95 (quantile lines or reference lines) at the computed values.',
    ],
  },
  {
    framework: 'svelte',
    scenario: 'phone-radar',
    prompt:
      'Radar chart comparing three phones on battery, camera, screen, performance, price and weight (scores 1–10). Show which polygon is which phone.',
    criteria: [
      'Uses RadarSeries with axes and three layers of six values.',
      'A legend (or RadarTooltip) names the phones.',
    ],
  },
  {
    framework: 'svelte',
    scenario: 'regional-bars',
    prompt:
      'Grouped bar chart of quarterly sales (Q1–Q4) for three regions: North, South and West, with the value above each bar.',
    criteria: [
      'BarSeries with three named layers grouped side by side (not stacked).',
      'A category or quarter-based X axis that shows Q1–Q4.',
      'Value labels above the bars.',
    ],
  },
  {
    framework: 'svelte',
    scenario: 'brand-theme',
    prompt:
      'Line chart of signups per day for the last month that follows the system light/dark mode, using our brand color #7c3aed for the line.',
    criteria: [
      'Switches between a light and a dark theme from prefers-color-scheme, and reacts when it changes.',
      'The line uses #7c3aed (in the data color or a custom theme).',
    ],
  },
];

const FRAMEWORKS = /** @type {const} */ (['react', 'vue', 'svelte']);

/** @type {Case[]} */
export const cases = [
  ...parity.flatMap((c) => FRAMEWORKS.map((framework) => ({ ...c, framework, id: `${c.scenario}-${framework}` }))),
  ...single.map((c) => ({ ...c, id: `${c.scenario}-${c.framework}` })),
];
