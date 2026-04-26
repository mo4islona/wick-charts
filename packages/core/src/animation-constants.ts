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
 * Y-range smoothing time constant (ms) for the visible Y window. Used as the
 * decay parameter for `smoothToward(rate = 1000 / yAxisMs, dt)` — wall-clock,
 * frame-rate independent. `0` / `false` snaps the Y range instantly.
 *
 * 80 ms is the perceptual equivalent of the legacy frame-count closure
 * `min(1, 16 / 80) = 0.2`-per-frame at 60 Hz: one frame closes ~19 % of the
 * remaining gap (`1 - exp(-12.5 * 0.01667) ≈ 0.188`).
 */
export const DEFAULT_Y_AXIS_MS = 80;

/**
 * Streaming-tick scroll animation duration (ms). Used by `viewport.scrollToEnd`
 * when a new live point arrives and auto-scroll keeps the right edge tracking
 * the data tail. Cubic ease-out — short enough that a 1-second tick rate
 * doesn't visibly lag, long enough to read as a slide rather than a jump.
 */
export const STREAM_SCROLL_MS = 140;

/**
 * Navigator mini-chart data-extent smoothing (ms). When new points arrive in
 * a stream, the navigator's effective `dataEnd` (and rarely `dataStart`)
 * exponentially chases the real bounds instead of snapping every tick.
 * Slightly slower than `DEFAULT_SMOOTH_MS` so the mini-chart reads as
 * "background inertia of the whole dataset" rather than reactive echo.
 * `setData` / history-prepend skip the chase via the `'dataReplaced'` event.
 */
export const DEFAULT_NAVIGATOR_SMOOTH_MS = 120;

/**
 * Upper bound for a single frame's `dt` (in seconds) when advancing
 * exponential smoothing. Prevents a long tab-inactive pause from applying
 * one giant correction when the tab regains focus.
 */
export const MAX_FRAME_DT_S = 0.05;
