import { describe, expect, it } from 'vitest';

import { computeTooltipPosition } from '../tooltip-position';

describe('computeTooltipPosition', () => {
  const chartWidth = 800;
  const chartHeight = 400;
  const tooltipWidth = 160;
  const tooltipHeight = 100;

  it('places the tooltip to the right and below the cursor when there is room', () => {
    const pos = computeTooltipPosition({ x: 100, y: 100, chartWidth, chartHeight, tooltipWidth, tooltipHeight });
    expect(pos).toEqual({ left: 100 + 16, top: 100 + 16 });
  });

  it('flips horizontally when the cursor is too close to the right edge', () => {
    const pos = computeTooltipPosition({ x: 750, y: 100, chartWidth, chartHeight, tooltipWidth, tooltipHeight });
    expect(pos.left).toBe(750 - 16 - tooltipWidth);
  });

  it('flips vertically when the cursor is too close to the bottom edge', () => {
    const pos = computeTooltipPosition({ x: 100, y: 380, chartWidth, chartHeight, tooltipWidth, tooltipHeight });
    expect(pos.top).toBe(380 - 16 - tooltipHeight);
  });

  it('clamps to the left edge after flipping if the tooltip is wider than the cursor margin', () => {
    const pos = computeTooltipPosition({ x: 10, y: 200, chartWidth, chartHeight, tooltipWidth, tooltipHeight });
    expect(pos.left).toBeGreaterThanOrEqual(0);
  });

  it('clamps to the top edge when flipping would push the tooltip above 0', () => {
    const pos = computeTooltipPosition({ x: 200, y: 10, chartWidth, chartHeight, tooltipWidth, tooltipHeight });
    expect(pos.top).toBe(10 + 16);
  });

  it('respects custom offsets', () => {
    const pos = computeTooltipPosition({
      x: 100,
      y: 100,
      chartWidth,
      chartHeight,
      tooltipWidth,
      tooltipHeight,
      offsetX: 4,
      offsetY: 2,
    });
    expect(pos).toEqual({ left: 104, top: 102 });
  });

  it('never returns negative coordinates even when the chart is smaller than the tooltip', () => {
    const pos = computeTooltipPosition({
      x: 20,
      y: 20,
      chartWidth: 80,
      chartHeight: 40,
      tooltipWidth: 200,
      tooltipHeight: 200,
    });
    expect(pos.left).toBeGreaterThanOrEqual(0);
    expect(pos.top).toBeGreaterThanOrEqual(0);
  });
});
