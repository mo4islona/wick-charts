import { useEffect, useState } from 'react';

import type { ChartTheme } from '@wick-charts/react';
import { ChevronDown, X } from 'lucide-react';

import { type Framework, useFramework } from '../context/framework';
import { HOOK_NAMES } from '../pages/api/frameworks';
import { type Route, type RouteEntry, type RouteSection, getSections, hookKeyForRoute } from '../routes';
import { hexToRgba } from '../utils';
import { FrameworkSelect } from './FrameworkSelect';

function labelFor(item: RouteEntry, fw: Framework): string {
  const reactName = hookKeyForRoute(item.route);
  if (!reactName) return item.label;

  return HOOK_NAMES[reactName]?.[fw] ?? item.label;
}

export type { Route } from '../routes';

const SECTIONS: RouteSection[] = getSections(import.meta.env.DEV);

/** Find the section heading that contains a route — used to auto-expand groups. */
function sectionOf(route: Route): string | null {
  for (const s of SECTIONS) {
    if (s.items.some((i) => i.route === route)) return s.heading;
  }

  return null;
}

export function Sidebar({
  route,
  onNavigate,
  collapsed,
  onToggle,
  theme,
  mobile = false,
}: {
  route: Route;
  onNavigate: (r: Route) => void;
  collapsed: boolean;
  onToggle: () => void;
  theme: ChartTheme;
  mobile?: boolean;
}) {
  const bg = theme.tooltip.background;
  const border = theme.tooltip.borderColor;
  const accent = theme.line.color;

  const [fw] = useFramework();

  const navIconSize = mobile ? 18 : 16;
  const fontSize = mobile ? theme.typography.fontSize + 1 : theme.typography.fontSize;

  // Track which section groups are expanded. Every headed group starts
  // expanded so the sidebar reads as a flat outline on first paint;
  // section headers act as collapse handles for users who want to focus.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const s of SECTIONS) {
      if (s.heading) initial[s.heading] = true;
    }

    return initial;
  });

  useEffect(() => {
    const heading = sectionOf(route);
    if (heading) setOpenSections((prev) => (prev[heading] ? prev : { ...prev, [heading]: true }));
  }, [route]);

  const toggle = (heading: string) => {
    setOpenSections((prev) => ({ ...prev, [heading]: !prev[heading] }));
  };

  return (
    <div
      style={{
        width: mobile ? 'min(280px, 80vw)' : collapsed ? 48 : 200,
        height: '100%',
        transition: mobile ? 'none' : 'width 0.2s ease',
        background: bg,
        borderRight: `1px solid ${border}`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {mobile && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px',
            borderBottom: `1px solid ${border}`,
            color: theme.tooltip.textColor,
          }}
        >
          <span style={{ fontSize: theme.typography.fontSize + 2, fontWeight: 600, letterSpacing: '-0.01em' }}>
            Wick Charts
          </span>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={onToggle}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              background: 'transparent',
              color: theme.axis.textColor,
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}

      <nav style={{ flex: 1, padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
        {SECTIONS.map((section, sIdx) => {
          // Sections with no heading render as a flat list (Overview).
          if (section.heading === null) {
            return (
              <div key={`s-${sIdx}`} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {section.items.map((item) => (
                  <NavButton
                    key={item.route}
                    item={item}
                    label={labelFor(item, fw)}
                    active={item.route === route}
                    onNavigate={onNavigate}
                    theme={theme}
                    collapsed={collapsed && !mobile}
                    mobile={mobile}
                    iconSize={navIconSize}
                    fontSize={fontSize}
                    accent={accent}
                  />
                ))}
              </div>
            );
          }

          const open = openSections[section.heading] ?? true;
          const showHeading = mobile || !collapsed;

          return (
            <div
              key={section.heading}
              style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: sIdx > 0 ? 6 : 0 }}
            >
              {showHeading && (
                <button
                  type="button"
                  onClick={() => toggle(section.heading as string)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 8px',
                    background: 'transparent',
                    color: theme.axis.textColor,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: fontSize - 1,
                    fontFamily: 'inherit',
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    opacity: 0.7,
                  }}
                >
                  <span>{section.heading}</span>
                  <ChevronDown
                    size={12}
                    style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }}
                  />
                </button>
              )}
              {(open || (collapsed && !mobile)) &&
                section.items.map((item) => (
                  <NavButton
                    key={item.route}
                    item={item}
                    label={labelFor(item, fw)}
                    active={item.route === route}
                    onNavigate={onNavigate}
                    theme={theme}
                    collapsed={collapsed && !mobile}
                    mobile={mobile}
                    iconSize={navIconSize}
                    fontSize={fontSize}
                    accent={accent}
                    indent={!collapsed || mobile}
                  />
                ))}
            </div>
          );
        })}
      </nav>

      <div
        style={{
          padding: mobile ? '10px 14px' : collapsed ? '6px 4px' : '6px 10px',
          borderTop: `1px solid ${border}`,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <FrameworkSelect theme={theme} compact />
      </div>

      {!mobile && (
        <button
          type="button"
          onClick={onToggle}
          style={{
            padding: 10,
            background: 'transparent',
            color: theme.axis.textColor,
            border: 'none',
            borderTop: `1px solid ${border}`,
            cursor: 'pointer',
            fontSize: 14,
            fontFamily: 'inherit',
            transition: 'color 0.1s',
          }}
        >
          {collapsed ? '›' : '‹'}
        </button>
      )}
    </div>
  );
}

function NavButton({
  item,
  label,
  active,
  onNavigate,
  theme,
  collapsed,
  mobile,
  iconSize,
  fontSize,
  accent,
  indent = false,
}: {
  item: RouteEntry;
  /** Display label override — defaults to `item.label`. Used for per-framework hook renames. */
  label?: string;
  active: boolean;
  onNavigate: (r: Route) => void;
  theme: ChartTheme;
  collapsed: boolean;
  mobile: boolean;
  iconSize: number;
  fontSize: number;
  accent: string;
  indent?: boolean;
}) {
  const Icon = item.icon;
  const displayLabel = label ?? item.label;
  const padLeft = indent && !collapsed ? 18 : collapsed ? 0 : 10;

  return (
    <button
      type="button"
      onClick={() => onNavigate(item.route)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: mobile ? 12 : 10,
        padding: mobile ? '10px 14px' : collapsed ? '8px 0' : `6px 10px 6px ${padLeft}px`,
        justifyContent: collapsed ? 'center' : 'flex-start',
        background: active ? hexToRgba(theme.crosshair.labelBackground, 0.8) : 'transparent',
        color: active ? theme.tooltip.textColor : theme.crosshair.labelTextColor,
        border: 'none',
        borderLeft: active ? `2px solid ${accent}` : '2px solid transparent',
        borderRadius: 4,
        fontSize,
        fontFamily: 'inherit',
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        transition: 'background 0.1s, color 0.1s',
        whiteSpace: 'nowrap',
        textAlign: 'left',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = hexToRgba(theme.crosshair.labelBackground, 0.3);
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent';
      }}
    >
      <span
        style={{
          width: 20,
          textAlign: 'center',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {Icon ? <Icon size={iconSize} /> : null}
      </span>
      {(!collapsed || mobile) && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayLabel}</span>}
    </button>
  );
}
