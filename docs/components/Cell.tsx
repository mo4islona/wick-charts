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
      data-cell=""
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        minWidth: 0,
        borderRadius: 6,
        overflow: 'hidden',
        border: `1px solid ${theme.tooltip.borderColor}`,
        ...style,
      }}
    >
      <div
        data-cell-title=""
        style={{
          flex: '0 0 auto',
          padding: '6px 8px 4px',
          fontSize: theme.typography.fontSize,
          fontWeight: 600,
          color: theme.tooltip.textColor,
          fontFamily: theme.typography.fontFamily,
          pointerEvents: 'none',
        }}
      >
        {label}{' '}
        <span style={{ fontWeight: 400, color: theme.axis.textColor, fontSize: theme.typography.axisFontSize }}>
          {sub}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>{children}</div>
    </div>
  );
}
