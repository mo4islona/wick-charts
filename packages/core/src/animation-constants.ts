/**
 * Shared animation defaults. All time knobs are in milliseconds; the suffix
 * `Ms` is standard across the public API.
 *
 * These are the *built-in* defaults. Resolution order for any per-series
 * animation field is: per-series option → `ChartOptions.animations.points.*`
 * → these constants.
 */

/** Entrance tween duration for a new candle/bar/line point. */
export const DEFAULT_ENTER_MS = 400;

/**
 * Exponential-smoothing time constant (ms) used to chase the live last value.
 * Roughly one "time constant" of decay: at 70 ms the displayed value closes
 * about 63% of the remaining gap to the target per tick. Equivalent to the
 * old `liveSmoothRate = 14` expressed in reciprocal seconds (1000 / 14 ≈ 71).
 */
export const DEFAULT_SMOOTH_MS = 70;

/** Pulse cycle period for the line's last-point halo. One full sine cycle. */
export const DEFAULT_PULSE_MS = 600;

/** Rebound (snap-back) animation duration after pan/zoom overshoot. */
export const DEFAULT_REBOUND_MS = 350;

/**
 * Y-axis range smoothing scale (ms). Per-frame closure: `min(1, 16 / yAxisMs)`
 * of the remaining gap each render. 80 ms ≈ 0.2 per 16 ms frame at 60 Hz —
 * the long-standing baseline. Unlike `smoothMs` / `enterMs` / `reboundMs`
 * this knob is frame-count-based (piggybacks on the render scheduler),
 * so perceptual duration scales with frame time on non-60 Hz displays.
 * `0` / `false` snaps the Y range instantly every frame.
 */
export const DEFAULT_Y_AXIS_MS = 80;

/**
 * Upper bound for a single frame's `dt` (in seconds) when advancing
 * exponential smoothing. Prevents a long tab-inactive pause from applying
 * one giant correction when the tab regains focus.
 */
export const MAX_FRAME_DT_S = 0.05;
