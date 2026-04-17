import { describe, expect, it } from 'vitest';

import { createFakeCanvas } from './fake-canvas';
import { createRecordingContext } from './recording-context';

describe('createRecordingContext', () => {
  it('records method calls with their arguments', () => {
    const { ctx, spy } = createRecordingContext();
    ctx.fillRect(1, 2, 3, 4);
    ctx.clearRect(0, 0, 10, 10);

    expect(spy.calls).toHaveLength(2);
    expect(spy.calls[0]).toMatchObject({ method: 'fillRect', args: [1, 2, 3, 4] });
    expect(spy.calls[1]).toMatchObject({ method: 'clearRect', args: [0, 0, 10, 10] });
  });

  it('captures style state on each call at call time, not later', () => {
    const { ctx, spy } = createRecordingContext();
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 10, 10);
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(20, 0, 10, 10);

    // If snapshots captured "latest" instead of "at call", both would read green.
    expect(spy.calls[0].fillStyle).toBe('#ff0000');
    expect(spy.calls[1].fillStyle).toBe('#00ff00');
  });

  it('reflects setters in subsequent getter reads', () => {
    const { ctx } = createRecordingContext();
    ctx.lineWidth = 2.5;
    ctx.font = '16px monospace';
    ctx.globalAlpha = 0.4;

    expect(ctx.lineWidth).toBe(2.5);
    expect(ctx.font).toBe('16px monospace');
    expect(ctx.globalAlpha).toBe(0.4);
  });

  it('save/restore pushes and pops state', () => {
    const { ctx, spy } = createRecordingContext();
    ctx.fillStyle = '#111';
    ctx.save();
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, 1, 1);
    ctx.restore();
    ctx.fillRect(0, 0, 1, 1);

    expect(spy.calls.filter((c) => c.method === 'fillRect').map((c) => c.fillStyle)).toEqual(['#222', '#111']);
  });

  it('createConicGradient serializes as a conic gradient (not linear)', () => {
    const { ctx, spy } = createRecordingContext();
    const grad = (
      ctx as unknown as { createConicGradient: (a: number, b: number, c: number) => CanvasGradient }
    ).createConicGradient(0, 0, 0);
    grad.addColorStop(0, '#123');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 10, 10);

    // If the impl still returned a 'linear' fake, this would say gradient(linear;...).
    expect(spy.calls.at(-1)?.fillStyle).toContain('gradient(conic');
  });

  it('createLinearGradient returns a gradient whose toString() carries the stops', () => {
    const { ctx, spy } = createRecordingContext();
    const grad = ctx.createLinearGradient(0, 0, 100, 0);
    grad.addColorStop(0, '#000');
    grad.addColorStop(1, '#fff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 100, 100);

    // Recorded fillStyle should be serialized gradient — proves renderer
    // path that chooses gradient vs. solid fill works.
    expect(spy.calls.at(-1)?.fillStyle).toContain('gradient(linear');
    expect(spy.calls.at(-1)?.fillStyle).toContain('0:#000');
    expect(spy.calls.at(-1)?.fillStyle).toContain('1:#fff');
  });

  it('callsOf / countOf filter by method name', () => {
    const { ctx, spy } = createRecordingContext();
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillRect(2, 2, 1, 1);
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();

    expect(spy.countOf('fillRect')).toBe(2);
    expect(spy.countOf('beginPath')).toBe(1);
    expect(spy.countOf('arc')).toBe(1);
    expect(spy.countOf('strokeRect')).toBe(0);
    expect(spy.callsOf('fillRect').map((c) => c.args[0])).toEqual([0, 2]);
  });

  it('reset() clears calls and returns state to defaults', () => {
    const { ctx, spy } = createRecordingContext();
    ctx.save();
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(0, 0, 1, 1);

    spy.reset();

    expect(spy.calls).toHaveLength(0);
    expect(ctx.fillStyle).toBe('#000000');
    // Stack should be empty too — restore() after reset must not surface pre-reset state.
    ctx.restore();
    expect(ctx.fillStyle).toBe('#000000');
  });

  it('matchesSequence finds a subsequence with gaps allowed', () => {
    const { ctx, spy } = createRecordingContext();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(10, 0);
    ctx.lineTo(10, 10);
    ctx.stroke();

    expect(spy.matchesSequence(['beginPath', 'moveTo', 'lineTo', 'stroke'])).toBe(true);
    // Order matters — reversed should fail.
    expect(spy.matchesSequence(['stroke', 'beginPath'])).toBe(false);
    // Empty sequence is vacuously true.
    expect(spy.matchesSequence([])).toBe(true);
    // Missing method.
    expect(spy.matchesSequence(['beginPath', 'arc'])).toBe(false);
  });

  it('fillStyleAt returns the most recent fillRect covering the point', () => {
    const { ctx, spy } = createRecordingContext();
    ctx.fillStyle = '#aaa';
    ctx.fillRect(0, 0, 100, 100);
    ctx.fillStyle = '#bbb';
    ctx.fillRect(20, 20, 10, 10); // overlaps — this wins for (25, 25)

    expect(spy.fillStyleAt(25, 25)).toBe('#bbb');
    expect(spy.fillStyleAt(5, 5)).toBe('#aaa');
    expect(spy.fillStyleAt(200, 200)).toBeNull();
  });
});

describe('createFakeCanvas', () => {
  it('hands out a recording 2d context and exposes __spy', () => {
    const { canvas, ctx, spy } = createFakeCanvas(300, 150);
    expect(canvas.width).toBe(300);
    expect(canvas.height).toBe(150);
    expect(canvas.getContext('2d')).toBe(ctx);
    expect(canvas.__spy).toBe(spy);

    ctx.fillRect(0, 0, 1, 1);
    expect(canvas.__spy.countOf('fillRect')).toBe(1);
  });
});
