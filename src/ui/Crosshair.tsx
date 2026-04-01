import { useChartInstance } from "../react/context";
import { useCrosshairPosition } from "../react/store-bridge";
import { formatTime } from "../utils/time";

export function Crosshair() {
  const chart = useChartInstance();
  const position = useCrosshairPosition(chart);

  if (!position) return null;

  const theme = chart.getTheme();
  const mediaSize = chart.getMediaSize();
  const dataInterval = chart.getDataInterval();

  const labelStyle = {
    background: theme.crosshair.labelBackground,
    color: theme.crosshair.labelTextColor,
    fontSize: theme.typography.axisFontSize,
    fontFamily: theme.typography.fontFamily,
    padding: "2px 6px",
    borderRadius: 2,
    whiteSpace: "nowrap" as const,
    pointerEvents: "none" as const,
  };

  return (
    <>
      {/* Price label on right axis */}
      <div
        style={{
          position: "absolute",
          right: 0,
          top: position.mediaY,
          transform: "translateY(-50%)",
          ...labelStyle,
        }}
      >
        {chart.priceScale.formatPrice(position.price)}
      </div>
      {/* Time label on bottom axis */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: position.mediaX,
          transform: "translateX(-50%)",
          ...labelStyle,
        }}
      >
        {formatTime(position.time, dataInterval)}
      </div>
    </>
  );
}
