import type { ChartTheme } from "./types";

export interface ThemePreset {
  name: string;
  fontUrl: string | null;
  theme: ChartTheme;
}

function t(
  name: string,
  bg: string,
  fg: string,
  dim: string,
  grid: string,
  up: string,
  down: string,
  line: string,
  series: string[],
  bandUp: string,
  bandLo: string,
  crosshair: string,
  crosshairBg: string,
  tooltipBg: string,
  tooltipBorder: string,
  font: string,
  fontUrl: string | null = null,
  fontSize = 12,
  axisFontSize = 10,
  priceFontSize = 11,
): ThemePreset {
  return {
    name,
    fontUrl,
    theme: {
      background: bg,
      chartGradient: [lightenHex(bg, 0.04), darkenHex(bg, 0.06)] as [string, string],
      typography: { fontFamily: font, fontSize, axisFontSize, priceFontSize },
      grid: { color: grid, style: "dashed" },
      candlestick: { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down },
      line: { color: line, width: 1, areaTopColor: hexToRgba(line, 0.08), areaBottomColor: hexToRgba(line, 0.01) },
      seriesColors: series,
      bands: { upper: bandUp, lower: bandLo },
      crosshair: { color: crosshair, labelBackground: crosshairBg, labelTextColor: fg },
      axis: { textColor: dim },
      priceLabel: { upBackground: up, downBackground: down, neutralBackground: crosshairBg, textColor: "#ffffff" },
      tooltip: { background: tooltipBg, textColor: fg, borderColor: tooltipBorder },
    },
  };
}

const MONO = "'JetBrains Mono', 'Fira Code', monospace";
const MONO_URL = "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap";
const INTER = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
const INTER_URL = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap";
const ROBOTO = "'Roboto Mono', monospace";
const ROBOTO_URL = "https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500;600&display=swap";
const IBM = "'IBM Plex Mono', monospace";
const IBM_URL = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap";
const FIRA = "'Fira Code', monospace";
const FIRA_URL = "https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&display=swap";
const CAVEAT = "'Caveat', 'Comic Sans MS', cursive";
const CAVEAT_URL = "https://fonts.googleapis.com/css2?family=Caveat:wght@400;500;600;700&display=swap";

export const themes: Record<string, ThemePreset> = {
  Dracula: t(
    "Dracula",
    "#282a36",
    "#f8f8f2",
    "#6272a4",
    "rgba(68,71,90,0.8)",
    "#50fa7b",
    "#ff5555",
    "#bd93f9",
    ["#bd93f9", "#ffb86c", "#50fa7b", "#ff79c6", "#ff5555", "#f1fa8c", "#8be9fd", "#ff5555", "#6272a4", "#ff79c6"],
    "#8be9fd",
    "#ff79c6",
    "rgba(98,114,164,0.4)",
    "#44475a",
    "rgba(40,42,54,0.92)",
    "rgba(68,71,90,0.6)",
    FIRA,
    FIRA_URL,
  ),

  "One Dark Pro": t(
    "One Dark Pro",
    "#282c34",
    "#abb2bf",
    "#5c6370",
    "rgba(59,64,72,0.8)",
    "#98c379",
    "#e06c75",
    "#61afef",
    ["#61afef", "#e5c07b", "#98c379", "#c678dd", "#e06c75", "#56b6c2", "#d19a66", "#be5046", "#61afef", "#c678dd"],
    "#56b6c2",
    "#c678dd",
    "rgba(99,110,123,0.4)",
    "#3e4451",
    "rgba(40,44,52,0.92)",
    "rgba(59,64,72,0.6)",
    MONO,
    MONO_URL,
  ),

  "Monokai Pro": t(
    "Monokai Pro",
    "#2d2a2e",
    "#fcfcfa",
    "#727072",
    "rgba(64,60,62,0.8)",
    "#a9dc76",
    "#ff6188",
    "#78dce8",
    ["#78dce8", "#fc9867", "#a9dc76", "#ab9df2", "#ff6188", "#ffd866", "#78dce8", "#ff6188", "#a9dc76", "#ab9df2"],
    "#78dce8",
    "#ff6188",
    "rgba(114,112,114,0.4)",
    "#403e42",
    "rgba(45,42,46,0.92)",
    "rgba(64,60,62,0.6)",
    FIRA,
    FIRA_URL,
  ),

  "Night Owl": t(
    "Night Owl",
    "#011627",
    "#d6deeb",
    "#637777",
    "rgba(31,52,72,0.8)",
    "#7ec699",
    "#e06c75",
    "#82aaff",
    ["#82aaff", "#d49a6a", "#7ec699", "#b48ead", "#e06c75", "#d4b568", "#5fb3a1", "#d47084", "#6bc5e0", "#b48ead"],
    "#6bc5e0",
    "#d47084",
    "rgba(99,119,119,0.4)",
    "#1d3b53",
    "rgba(1,22,39,0.92)",
    "rgba(31,52,72,0.6)",
    MONO,
    MONO_URL,
  ),

  "Material Palenight": t(
    "Material Palenight",
    "#292d3e",
    "#a6accd",
    "#676e95",
    "rgba(55,59,75,0.8)",
    "#c3e88d",
    "#f07178",
    "#82aaff",
    ["#82aaff", "#f78c6c", "#c3e88d", "#c792ea", "#f07178", "#ffcb6b", "#89ddff", "#ff5370", "#82aaff", "#c792ea"],
    "#89ddff",
    "#f07178",
    "rgba(103,110,149,0.4)",
    "#34324a",
    "rgba(41,45,62,0.92)",
    "rgba(55,59,75,0.6)",
    ROBOTO,
    ROBOTO_URL,
  ),

  Gruvbox: t(
    "Gruvbox",
    "#282828",
    "#ebdbb2",
    "#928374",
    "rgba(60,56,54,0.8)",
    "#b8bb26",
    "#fb4934",
    "#83a598",
    ["#83a598", "#fe8019", "#b8bb26", "#d3869b", "#fb4934", "#fabd2f", "#8ec07c", "#fb4934", "#458588", "#d3869b"],
    "#83a598",
    "#d3869b",
    "rgba(146,131,116,0.4)",
    "#3c3836",
    "rgba(40,40,40,0.92)",
    "rgba(60,56,54,0.6)",
    MONO,
    MONO_URL,
  ),

  Catppuccin: t(
    "Catppuccin",
    "#1e1e2e",
    "#cdd6f4",
    "#6c7086",
    "rgba(49,50,68,0.8)",
    "#a6e3a1",
    "#f38ba8",
    "#89b4fa",
    ["#89b4fa", "#fab387", "#a6e3a1", "#cba6f7", "#f38ba8", "#f9e2af", "#94e2d5", "#eba0ac", "#74c7ec", "#cba6f7"],
    "#74c7ec",
    "#f38ba8",
    "rgba(108,112,134,0.4)",
    "#313244",
    "rgba(30,30,46,0.92)",
    "rgba(49,50,68,0.6)",
    INTER,
    INTER_URL,
  ),

  "Ayu Mirage": t(
    "Ayu Mirage",
    "#1f2430",
    "#cbccc6",
    "#5c6773",
    "rgba(42,48,60,0.8)",
    "#bae67e",
    "#f27983",
    "#73d0ff",
    ["#73d0ff", "#ffad66", "#bae67e", "#d4bfff", "#f27983", "#ffd580", "#95e6cb", "#f28779", "#5ccfe6", "#d4bfff"],
    "#5ccfe6",
    "#f28779",
    "rgba(92,103,115,0.4)",
    "#2a3040",
    "rgba(31,36,48,0.92)",
    "rgba(42,48,60,0.6)",
    INTER,
    INTER_URL,
  ),

  Panda: t(
    "Panda",
    "#292a2b",
    "#e6e6e6",
    "#757575",
    "rgba(58,58,60,0.8)",
    "#19f9d8",
    "#ff75b5",
    "#6fc1ff",
    ["#6fc1ff", "#ffb86c", "#19f9d8", "#b084eb", "#ff75b5", "#ffcc95", "#19f9d8", "#ff4b82", "#45a9f9", "#b084eb"],
    "#45a9f9",
    "#ff75b5",
    "rgba(117,117,117,0.4)",
    "#3a3a3c",
    "rgba(41,42,43,0.92)",
    "rgba(58,58,60,0.6)",
    FIRA,
    FIRA_URL,
  ),

  Andromeda: t(
    "Andromeda",
    "#23262e",
    "#d5ced9",
    "#665e6e",
    "rgba(50,48,56,0.8)",
    "#96e072",
    "#ee5d43",
    "#00e8c6",
    ["#00e8c6", "#f39c12", "#96e072", "#c74ded", "#ee5d43", "#ffe66d", "#00e8c6", "#ee5d43", "#7cb7ff", "#c74ded"],
    "#7cb7ff",
    "#c74ded",
    "rgba(102,94,110,0.4)",
    "#2e3038",
    "rgba(35,38,46,0.92)",
    "rgba(50,48,56,0.6)",
    ROBOTO,
    ROBOTO_URL,
  ),

  Handwritten: {
    name: "Handwritten",
    fontUrl: CAVEAT_URL,
    theme: {
      background: "#fdf6e3",
      chartGradient: ["#fdf6e3", "#fdf6e3"] as [string, string], // no gradient
      typography: { fontFamily: CAVEAT, fontSize: 16, axisFontSize: 13, priceFontSize: 15 },
      grid: { color: "rgba(180,170,150,0.3)", style: "dashed" as const },
      candlestick: { upColor: "#7a9a5e", downColor: "#b07060", wickUpColor: "#7a9a5e", wickDownColor: "#b07060" },
      line: {
        color: "#6a8fa0",
        width: 1,
        areaTopColor: "rgba(106,143,160,0.08)",
        areaBottomColor: "rgba(106,143,160,0.01)",
      },
      seriesColors: [
        "#6a8fa0",
        "#c09050",
        "#7a9a5e",
        "#8a7098",
        "#b07060",
        "#a09030",
        "#508878",
        "#a06878",
        "#6888a0",
        "#8870a0",
      ],
      bands: { upper: "#6888a0", lower: "#a06878" },
      crosshair: { color: "rgba(160,152,128,0.3)", labelBackground: "#e8dcc8", labelTextColor: "#5c5040" },
      axis: { textColor: "#a09880" },
      priceLabel: {
        upBackground: "#7a9a5e",
        downBackground: "#b07060",
        neutralBackground: "#e8dcc8",
        textColor: "#fdf6e3",
      },
      tooltip: { background: "rgba(253,246,227,0.95)", textColor: "#5c5040", borderColor: "rgba(180,170,150,0.4)" },
    },
  },
};

// Keep buildTheme for backward compat, but now it just picks a preset
export function buildTheme(themeName: string): ChartTheme {
  return (themes[themeName] ?? themes["One Dark Pro"]).theme;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function lightenHex(hex: string, amount: number): string {
  if (!hex.startsWith("#")) return hex;
  const r = Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) + 255 * amount));
  const g = Math.min(255, Math.round(parseInt(hex.slice(3, 5), 16) + 255 * amount));
  const b = Math.min(255, Math.round(parseInt(hex.slice(5, 7), 16) + 255 * amount));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function darkenHex(hex: string, amount: number): string {
  if (!hex.startsWith("#")) return hex;
  const r = Math.max(0, Math.round(parseInt(hex.slice(1, 3), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(hex.slice(3, 5), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(hex.slice(5, 7), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}
