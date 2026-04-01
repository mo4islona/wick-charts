import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChartInstance, type ChartOptions } from "../core/chart";
import type { ChartTheme } from "../theme/types";
import { ChartContext } from "./context";

export interface ChartContainerProps {
  children?: ReactNode;
  theme?: ChartTheme;
  style?: CSSProperties;
  className?: string;
}

export function ChartContainer({ children, theme, style, className }: ChartContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartInstance | null>(null);
  const [revision, setRevision] = useState(0);

  // useLayoutEffect — synchronous, runs before paint.
  // Chart is ready before React paints, so no flash.
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    // Already created (StrictMode re-mount) — reuse
    if (chartRef.current) return;

    const options: ChartOptions = {};
    if (theme) options.theme = theme;
    chartRef.current = new ChartInstance(containerRef.current, options);
    setRevision((r) => r + 1); // trigger one re-render to show children

    return () => {
      // Defer destroy to avoid StrictMode double-mount killing the canvas
      const instance = chartRef.current;
      chartRef.current = null;
      // Use setTimeout so StrictMode re-mount can check chartRef first
      setTimeout(() => {
        if (!chartRef.current) {
          instance?.destroy();
        }
      }, 0);
    };
  }, []);

  useEffect(() => {
    if (chartRef.current && theme) {
      chartRef.current.setTheme(theme);
    }
  }, [theme]);

  const chart = chartRef.current;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        ...style,
      }}
    >
      {chart && (
        <ChartContext.Provider value={chart}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              zIndex: 2,
            }}
          >
            {children}
          </div>
        </ChartContext.Provider>
      )}
    </div>
  );
}
