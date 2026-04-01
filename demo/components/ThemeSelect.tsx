import { useState } from "react";
import { themes } from "../../src";
import type { ChartTheme } from "../../src/theme/types";
import { hexToRgba } from "../utils";

const themeNames = Object.keys(themes);

export function ThemeSelect({
  value,
  onChange,
  theme,
}: {
  value: string;
  onChange: (v: string) => void;
  theme: ChartTheme;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: theme.crosshair.labelBackground,
          color: theme.tooltip.textColor,
          border: `1px solid ${theme.tooltip.borderColor}`,
          borderRadius: 6,
          padding: "5px 12px",
          fontSize: theme.typography.fontSize,
          fontFamily: "inherit",
          fontWeight: 500,
          cursor: "pointer",
          outline: "none",
        }}
      >
        <ThemeDots t={themes[value].theme} />
        {value}
        <span style={{ opacity: 0.4, fontSize: theme.typography.axisFontSize, marginLeft: 2 }}>▾</span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 99 }} />
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: 4,
              background: theme.tooltip.background,
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              border: `1px solid ${theme.tooltip.borderColor}`,
              borderRadius: 8,
              boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)",
              padding: 4,
              zIndex: 100,
              minWidth: 200,
              overflow: "hidden",
            }}
          >
            {themeNames.map((name) => {
              const t = themes[name].theme;
              const active = name === value;
              return (
                <button
                  key={name}
                  onClick={() => {
                    onChange(name);
                    setOpen(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    background: active ? hexToRgba(theme.crosshair.labelBackground, 0.8) : "transparent",
                    color: active ? theme.tooltip.textColor : theme.axis.textColor,
                    border: "none",
                    padding: "7px 10px",
                    borderRadius: 5,
                    fontSize: theme.typography.fontSize,
                    fontFamily: "inherit",
                    fontWeight: active ? 600 : 400,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = hexToRgba(theme.crosshair.labelBackground, 0.4);
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <ThemeDots t={t} />
                  <span style={{ flex: 1 }}>{name}</span>
                  <span style={{ fontSize: 9, opacity: 0.4, fontFamily: t.typography.fontFamily }}>Aa</span>
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 3,
                      background: t.background,
                      border: `1px solid ${theme.tooltip.borderColor}`,
                      flexShrink: 0,
                    }}
                  />
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ThemeDots({ t }: { t: ChartTheme }) {
  return (
    <span style={{ display: "flex", gap: 3 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: t.candlestick.upColor }} />
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: t.line.color }} />
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: t.candlestick.downColor }} />
    </span>
  );
}
