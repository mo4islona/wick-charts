import type { ChartTheme } from '@wick-charts/react';

export function Cell({
  label,
  sub,
  children,
  theme,
  style,
}: {
  label: string;
  sub: string;
  children: React.ReactNode;
  theme: ChartTheme;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        position: 'relative',
        minHeight: 0,
        minWidth: 0,
        borderRadius: 6,
        overflow: 'hidden',
        border: `1px solid ${theme.tooltip.borderColor}`,
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 6,
          left: 8,
          fontSize: theme.typography.fontSize,
          fontWeight: 600,
          color: theme.tooltip.textColor,
          zIndex: 3,
          pointerEvents: 'none',
          fontFamily: theme.typography.fontFamily,
        }}
      >
        {label}{' '}
        <span style={{ fontWeight: 400, color: theme.axis.textColor, fontSize: theme.typography.axisFontSize }}>
          {sub}
        </span>
      </div>
      {children}
    </div>
  );
}
