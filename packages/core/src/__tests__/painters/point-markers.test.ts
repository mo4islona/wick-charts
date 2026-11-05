import { describe, expect, it } from 'vitest';

import {
  diamondPoint,
  dotPoint,
  extremaPoints,
  lastPointOnly,
  pointsWhere,
  ringPoint,
  squarePoint,
  trianglePoint,
} from '../../series/painters/point-markers';
import type { PaintEnv, PointPaintArgs } from '../../series/painters/types';
import { createRecordingContext } from '../../testing/recording-context';
import { catppuccin } from '../../theme/themes/catppuccin';

const POINT: PointPaintArgs = {
  x: 100,
  y: 50,
  value: 7,
  time: 1,
  index: 0,
  color: '#2962ff',
  radius: 6,
  hovered: false,
  isLast: false,
  isMin: false,
  isMax: false,
};

function setup() {
  const { ctx, spy } = createRecordingContext();
  const env: PaintEnv = { ctx, theme: catppuccin.theme, horizontalPixelRatio: 2, verticalPixelRatio: 2 };

  return { env, spy };
}

describe('shape presets', () => {
  it('dotPoint fills a circle in the marker color', () => {
    const { env, spy } = setup();

    dotPoint()(env, POINT);

    expect(spy.callsOf('arc')[0].args.slice(0, 3)).toEqual([100, 50, 6]);
    expect(spy.callsOf('fill')[0].fillStyle).toBe('#2962ff');
    expect(spy.countOf('stroke')).toBe(0);
  });

  it('ringPoint fills with the background and strokes in the marker color', () => {
    const { env, spy } = setup();

    ringPoint()(env, POINT);

    expect(spy.callsOf('fill')[0].fillStyle).toBe(catppuccin.theme.background);
    expect(spy.callsOf('stroke')[0].strokeStyle).toBe('#2962ff');
    expect(spy.callsOf('stroke')[0].lineWidth).toBe(3);
  });

  it('takes its sizes in CSS px and its colors from the options', () => {
    const { env, spy } = setup();

    ringPoint({ radius: 5, fill: '#ffffff', stroke: '#000000', strokeWidth: 2 })(env, POINT);

    expect(spy.callsOf('arc')[0].args[2]).toBe(10);
    expect(spy.callsOf('fill')[0].fillStyle).toBe('#ffffff');
    expect(spy.callsOf('stroke')[0].strokeStyle).toBe('#000000');
    expect(spy.callsOf('stroke')[0].lineWidth).toBe(4);
  });

  it('squarePoint centers a rect on the point', () => {
    const { env, spy } = setup();

    squarePoint()(env, POINT);

    const [x, y, width, height] = spy.callsOf('rect')[0].args.map(Number);
    expect(x + width / 2).toBeCloseTo(100);
    expect(y + height / 2).toBeCloseTo(50);
    expect(spy.countOf('fill')).toBe(1);
  });

  it.each([
    ['diamondPoint', diamondPoint, 3],
    ['trianglePoint', trianglePoint, 2],
  ])('%s closes a polygon around the point', (_name, preset, lines) => {
    const { env, spy } = setup();

    preset()(env, POINT);

    expect(spy.countOf('lineTo')).toBe(lines);
    expect(spy.matchesSequence(['beginPath', 'moveTo', 'lineTo', 'closePath', 'fill'])).toBe(true);
  });

  it('draws a halo and grows on hover, leaving the alpha as it found it', () => {
    const { env, spy } = setup();

    dotPoint()(env, { ...POINT, hovered: true });

    const [halo, dot] = spy.callsOf('arc');
    expect(halo.args[2]).toBe(14);
    expect(dot.args[2]).toBe(8);

    const [haloFill, dotFill] = spy.callsOf('fill');
    expect(haloFill.globalAlpha).toBeCloseTo(0.25);
    expect(dotFill.globalAlpha).toBe(1);
  });

  it('tints the halo of a ring with its outline, not its background fill', () => {
    const { env, spy } = setup();

    ringPoint()(env, { ...POINT, hovered: true });

    expect(spy.callsOf('fill')[0].fillStyle).toBe('#2962ff');
  });
});

describe('selection helpers', () => {
  it('pointsWhere skips the rest and draws what it picks', () => {
    const { env, spy } = setup();
    const painter = pointsWhere((point) => point.index % 2 === 0, ringPoint());

    expect(painter(env, { ...POINT, index: 1 })).toBe(false);
    expect(spy.countOf('arc')).toBe(0);

    expect(painter(env, { ...POINT, index: 2 })).not.toBe(false);
    expect(spy.countOf('stroke')).toBe(1);
  });

  it('defaults to a dot and opts out of the density check', () => {
    const { env, spy } = setup();
    const painter = lastPointOnly();

    painter(env, { ...POINT, isLast: true });

    expect(spy.countOf('arc')).toBe(1);
    expect(painter.selective).toBe(true);
  });

  it('lastPointOnly picks only the last point', () => {
    const { env } = setup();

    expect(lastPointOnly()(env, POINT)).toBe(false);
  });

  it('extremaPoints picks the min and the max', () => {
    const { env, spy } = setup();
    const painter = extremaPoints();

    expect(painter(env, POINT)).toBe(false);

    painter(env, { ...POINT, isMin: true });
    painter(env, { ...POINT, isMax: true });

    expect(spy.countOf('arc')).toBe(2);
  });
});
