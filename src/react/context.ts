import { createContext, useContext } from "react";
import type { ChartInstance } from "../core/chart";

export const ChartContext = createContext<ChartInstance | null>(null);

export function useChartInstance(): ChartInstance {
  const chart = useContext(ChartContext);
  if (!chart) {
    throw new Error("useChartInstance must be used within <ChartContainer>");
  }
  return chart;
}
